const mongoose = require('mongoose');

// Participant sub-schema
const participantSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    default: 0
  }
}, { _id: false });

// Quiz schema
const quizSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true, 
    unique: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  category: { 
    type: String, 
    required: true 
  },
  createdBy: { 
    type: String, 
    required: true 
  },
  creatorName: { 
    type: String, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['pending', 'active', 'completed'], 
    default: 'pending' 
  },
  participants: [participantSchema],
  questions: [{
    text: { type: String, required: true },
    type: { type: String, required: true },
    options: { type: [String], default: [] },
    correctAnswer: { type: String, required: true },
    timeLimit: { type: Number, default: 30 }
  }],
  scores: [{
    userId: String,
    username: String,
    score: Number,
    submittedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Create indexes for better query performance
quizSchema.index({ code: 1 }, { unique: true });
quizSchema.index({ createdBy: 1 });
quizSchema.index({ status: 1 });

const Quiz = mongoose.model('Quiz', quizSchema);

module.exports = Quiz;
