const mongoose = require('mongoose');

const customerInquirySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  serviceCategory: {
    type: String,
    required: true,
    enum: [
      'Digital Transformation',
      'IoT Interfacing',
      'Automation & RPA',
      'Data / AI Strategy',
      'Custom Tech Solutions'
    ]
  },
  isSeeded: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('CustomerInquiry', customerInquirySchema);
