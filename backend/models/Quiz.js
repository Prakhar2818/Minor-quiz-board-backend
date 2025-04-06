const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
  text: String,
  type: String,
  options: [String],
  correctAnswer: String,
});

const QuizSchema = new mongoose.Schema({
  title: String,
  category: String,
  code: String,
  creator: String,
  participants: [String],
  questions: [QuestionSchema],
  status: { type: String, default: "waiting" },
  scores: [
    {
      userId: String,
      score: Number,
    },
  ],
});

module.exports = mongoose.model("Quiz", QuizSchema);
