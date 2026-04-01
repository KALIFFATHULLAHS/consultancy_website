# NEXGEN Technology Consultancy Platform

A premium, full-stack web application designed for a high-end technology consultancy. Features secure user authentication, a GenAI-powered strategic assistant, and a responsive modern interface.

## 🚀 Features

- **Premium Frontend**: Built with HTML5, CSS3, and Bootstrap 5. Fully responsive (Desktop, Tablet, Mobile).
- **Secure Authentication**: 
    - Email/Password signup & login with Bcrypt hashing.
    - Session-based persistence with HTTP-only, secure cookie handling.
    - Google OAuth 2.0 integration (ready for production).
- **GenAI Conversational Assistant**: 
    - Powered by Google Gemini (Flash 2.5).
    - Session-aware (recognizes authenticated users).
    - Robust fallback mechanism for 100% uptime.
- **Consultation Management**: Real-time inquiry submission and admin dashboard for tracking leads.
- **Production-Ready Backend**: Node.js & Express with Mongoose (MongoDB) integration.

## 🛠️ Tech Stack

- **Frontend**: Vanilla JS, Bootstrap 5, CSS3.
- **Backend**: Node.js, Express.
- **Database**: MongoDB (Mongoose).
- **AI**: Google Generative AI (Gemini).
- **Auth**: Passport.js (Local & Google Strategies).

## ⚙️ Setup & Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/KALIFFATHULLAHS/consultancy_website.git
   cd consultancy_website
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   MONGODB_URI=your_mongodb_connection_string
   SESSION_SECRET=your_random_secret_key
   GEMINI_API_KEY=your_google_gemini_api_key
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```
   *Note: If `MONGODB_URI` is missing, the app will use an in-memory database for testing.*

4. **Run the application**:
   ```bash
   npm start
   ```
   The site will be available at `http://localhost:3000`.

## 📂 Project Structure

- `server.js`: Main Express application and API routes.
- `models/`: Mongoose schemas for Users and Inquiries.
- `index.html`: Main landing page with Chatbot UI.
- `login.html/signup.html`: Authentication pages.
- `styles.css`: Custom premium styling.
- `favicon.png`: Brand identity asset.

## 🛡️ Security Features

- **Password Hashing**: Salted Bcrypt (10 rounds).
- **Session Protection**: Cookies are `httpOnly` and `sameSite: lax`.
- **Input Validation**: Frontend and backend checks for all form submissions.
- **Environment Safety**: Critical secrets are managed via `.env`.

---
© 2026 NEXGEN Advisory. Engineered for Excellence.
