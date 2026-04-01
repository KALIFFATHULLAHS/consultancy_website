require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const User = require('./models/User');
const CustomerInquiry = require('./models/CustomerInquiry');

// Validate Environment Variables
const requiredEnv = ['SESSION_SECRET'];
const missingEnv = requiredEnv.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
  console.error(`CRITICAL ERROR: Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set. Chatbot will use fallback public API.");
}

// Middleware to check authentication
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login.html?error=auth_required');
}

// Middleware to check admin status (email domain or specific email)
function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && (req.user.email.toLowerCase().endsWith('@nexgen.com'))) {
    return next();
  }
  res.status(403).redirect('/?error=access_denied');
}


// Load Knowledge Base
let knowledgeBase = {};
try {
  const kData = fs.readFileSync(path.join(__dirname, 'knowledge_base.json'), 'utf8');
  knowledgeBase = JSON.parse(kData);
  console.log('[AI] Knowledge Base loaded successfully.');
} catch (e) {
  console.error('[AI] Failed to load knowledge base:', e.message);
}

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, // Prevents client-side JS from reading the cookie
    secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// --- Routing (Internal Pages & Static Assets) ---

// Public Pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'index.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'login.html'));
});

app.get('/signup.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'signup.html'));
});

// Protected Pages (Authenticated)
app.get('/profile.html', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'profile.html'));
});

// Admin-Only Pages
app.get('/requests.html', ensureAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'requests.html'));
});

// Serve only assets (CSS, Images) statically from 'static' folder
app.use(express.static(path.join(__dirname, 'static')));

// Database Connection
const { MongoMemoryServer } = require('mongodb-memory-server');

async function connectDB() {
  let uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn("WARNING: MONGODB_URI is not set in .env. Starting an in-memory MongoDB instance for immediate use...");
    const mongoServer = await MongoMemoryServer.create();
    uri = mongoServer.getUri();
  }

  try {
    await mongoose.connect(uri);
    const dbType = process.env.MONGODB_URI ? 'external cluster' : 'in-memory instance';
    console.log(`[Database] Successfully connected to MongoDB at ${dbType}`);
    await seedDatabase();
  } catch (err) {
    console.error('[Database] Connection critical failure:', err.message);
    // Do not exit process here to allow the server to potentially serve static files even if DB is down (for frontend dev)
  }
}

connectDB();

// Seed Database Function
async function seedDatabase() {
  const count = await CustomerInquiry.countDocuments({ isSeeded: true });
  if (count > 0) return; // Already seeded

  console.log("Seeding database with customers...");
  const services = [
    'Digital Transformation',
    'IoT Interfacing',
    'Automation & RPA',
    'Data / AI Strategy',
    'Custom Tech Solutions'
  ];

  const seeds = [];
  services.forEach((service, serviceIndex) => {
    for (let i = 1; i <= 3; i++) {
      seeds.push({
        name: `Seeded Customer ${i} - ${service.substring(0, 4)}`,
        email: `customer${serviceIndex}_${i}@example.com`,
        serviceCategory: service,
        isSeeded: true
      });
    }
  });

  await CustomerInquiry.insertMany(seeds);
  console.log('Database seeded with 15 initial customers.');
}

// --- Passport Configuration ---
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Local Strategy
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return done(null, false, { message: 'Incorrect email.' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return done(null, false, { message: 'Incorrect password.' });
    }
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

// Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.findOne({ email: profile.emails[0].value });
        if (user) {
          // Link existing email to Google ID
          user.googleId = profile.id;
          await user.save();
        } else {
          // Create new user
          user = new User({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value
          });
          await user.save();
        }
      }
      return cb(null, user);
    } catch (err) {
      return cb(err);
    }
  }));
}

// --- Auth Routes ---
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    user = new User({ name, email, password });
    await user.save();
    
    // Auto-login after signup
    req.login(user, (err) => {
      if (err) throw err;
      return res.json({ success: true, message: 'Signup successful!', user: { name: user.name, email: user.email }});
    });
  } catch (error) {
    console.error('[Auth] Signup API Failure:', error.message);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

app.post('/api/auth/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(400).json({ success: false, message: info.message || 'Login failed' });
    
    req.logIn(user, (err) => {
      if (err) {
        console.error('[Auth] Login session start failure:', err.message);
        return next(err);
      }
      return res.json({ success: true, message: 'Login successful!', user: { name: user.name, email: user.email } });
    });
  })(req, res, next);
});

// Google Auth endpoints
app.get('/api/auth/google', (req, res, next) => {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
  } else {
    // MOCK Google Login
    res.redirect('/api/auth/google/mock');
  }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  app.get('/api/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login.html?error=google_auth_failed' }),
    function(req, res) {
      res.redirect('/?login=success');
    }
  );
}

app.get('/api/auth/google/mock', async (req, res) => {
  try {
    let user = await User.findOne({ email: 'demo.google@company.com' });
    if (!user) {
      user = new User({
        googleId: 'mock_google_id_999',
        name: 'Demo Google User',
        email: 'demo.google@company.com'
      });
      await user.save();
    }
    req.logIn(user, (err) => {
      if (err) {
        console.error("req.logIn Error:", err);
        return res.redirect('/login.html?error=google_auth_failed');
      }
      return res.redirect('/?login=success');
    });
  } catch (error) {
    console.error("Mock Google Login Error:", error);
    res.redirect('/login.html?error=google_auth_failed');
  }
});

// Get current user details
app.get('/api/auth/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ 
      authenticated: true, 
      user: { 
        name: req.user.name, 
        email: req.user.email,
        createdAt: req.user.createdAt,
        isAdmin: req.user.email.toLowerCase().endsWith('@nexgen.com')
      } 
    });
  } else {
    res.json({ authenticated: false });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});

// --- Inquiry Routes ---
app.post('/api/inquiry', async (req, res) => {
  try {
    const { name, email, serviceCategory } = req.body;
    const newInquiry = new CustomerInquiry({ name, email, serviceCategory });
    await newInquiry.save();
    res.json({ success: true, message: 'We will contact you shortly!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error processing your inquiry' });
  }
});

// Admin Route to view all customer requests
app.get('/api/admin/inquiries', ensureAdmin, async (req, res) => {
  try {
    const inquiries = await CustomerInquiry.find().sort({ createdAt: -1 });
    res.json(inquiries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch customer inquiries' });
  }
});

// --- Chatbot Route (GenAI) ---
let ai;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'Message required' });

  // Add user context if authenticated
  let userContext = "";
  let logPrefix = "[Chat] Guest";
  if (req.isAuthenticated() && req.user) {
    userContext = ` You are talking to a user named ${req.user.name}.`;
    logPrefix = `[Chat] User:${req.user.email}`;
  }

  console.log(`${logPrefix} inquired: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

  // Build dynamic system prompt using Knowledge Base
  const kbSummary = `
Company: ${knowledgeBase.company_name}
Mission: ${knowledgeBase.vision}
Hub Locations: ${knowledgeBase.hubs ? knowledgeBase.hubs.map(h => `${h.location} (${h.specialty})`).join(', ') : 'Global'}
Core Services: ${knowledgeBase.services ? knowledgeBase.services.map(s => `${s.name}: ${s.description}`).join(' | ') : 'Technology Consulting'}
Tone: ${knowledgeBase.tone_of_voice || 'Professional'}
FAQs: ${knowledgeBase.faqs ? knowledgeBase.faqs.map(f => `Q: ${f.question} A: ${f.answer}`).join('\n') : ''}
`;

  if (!ai) {
    try {
      const systemPrompt = `You are an expert AI Assistant and Technical Consultant for NEXGEN Advisory. Use the following context to answer: ${kbSummary}.${userContext} If you don't know something from the context, mention that users should contact us at engineering@nextgen.com. Answer briefly: `;
      const encodedPrompt = encodeURIComponent(systemPrompt + message);
      const fetchResponse = await fetch(`https://text.pollinations.ai/prompt/${encodedPrompt}`);
      if (!fetchResponse.ok) throw new Error("Fallback LLM failed");
      const reply = await fetchResponse.text();
      return res.json({ success: true, reply: reply });
    } catch (fallbackError) {
      console.error('[Chat] Fallback Error:', fallbackError.message);
      return res.json({ success: false, reply: 'Hello! Our intelligence module is temporarily offline. Please use our consultation form for priority support.' });
    }
  }

  try {
    const systemPrompt = `You are a Lead AI Consultant at NEXGEN Advisory. Utilize the Knowledge Base context for all answers: ${kbSummary}.${userContext} Use professional, slightly technical, and consultative formatting.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: message,
      config: {
        systemInstruction: systemPrompt,
      }
    });

    res.json({ success: true, reply: response.text });
  } catch (error) {
    console.error('[Chat] Gemini Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to generate response.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
