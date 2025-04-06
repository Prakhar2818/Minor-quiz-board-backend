const router = require("express").Router();
const Quiz = require("../models/Quiz");

// Create Quiz endpoint
router.post("/create", async (req, res) => {
  try {
    const { title, category, questions, userId } = req.body;

    // Validate input
    if (!title || !category || !questions || questions.length === 0) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    // Validate questions format
    for (const question of questions) {
      if (!question.text || !question.type || !question.correctAnswer) {
        return res.status(400).json({
          error: 'Invalid question format'
        });
      }
      // Validate multiple choice questions have options
      if (question.type === 'multiple' && (!question.options || question.options.length < 2)) {
        return res.status(400).json({
          error: 'Multiple choice questions must have at least 2 options'
        });
      }
    }

    // Generate a unique code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Create new quiz
    const quiz = new Quiz({
      code,
      title,
      category,
      questions: questions.map(q => ({
        text: q.text,
        type: q.type,
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        timeLimit: q.timeLimit || 30 // default 30 seconds per question
      })),
      status: "waiting",
      participants: [],
      scores: [],
      createdBy: userId
    });

    await quiz.save();

    res.status(201).json({ 
      message: 'Quiz created successfully',
      code: quiz.code,
      quizId: quiz._id
    });

  } catch (error) {
    console.error('Quiz creation error:', error);
    res.status(500).json({ 
      error: 'Failed to create quiz',
      details: error.message 
    });
  }
});

// Get quiz details (without answers)
router.get("/:code", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ code: req.params.code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Remove correct answers from response
    const sanitizedQuestions = quiz.questions.map(q => ({
      text: q.text,
      type: q.type,
      options: q.options,
      timeLimit: q.timeLimit
    }));

    res.json({
      code: quiz.code,
      title: quiz.title,
      category: quiz.category,
      questions: sanitizedQuestions,
      status: quiz.status,
      participantCount: quiz.participants.length
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
});

// Get quiz details for creator (with answers)
router.get("/:code/admin", async (req, res) => {
  try {
    const { userId } = req.body; // Assuming you're passing userId in request
    const quiz = await Quiz.findOne({ code: req.params.code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (quiz.createdBy !== userId) {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    res.json(quiz);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch quiz details" });
  }
});

router.post("/join", async (req, res) => {
  try {
    const { code, userId } = req.body;
    const quiz = await Quiz.findOne({ code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (quiz.status !== 'waiting') {
      return res.status(400).json({ error: "Quiz has already started" });
    }

    if (!quiz.participants.includes(userId)) {
      quiz.participants.push(userId);
      await quiz.save();
    }

    // Send initial quiz data without answers
    const sanitizedQuestions = quiz.questions.map(q => ({
      text: q.text,
      type: q.type,
      options: q.options,
      timeLimit: q.timeLimit
    }));

    res.json({ 
      message: "Joined quiz successfully",
      quiz: {
        title: quiz.title,
        category: quiz.category,
        questions: sanitizedQuestions,
        participantCount: quiz.participants.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to join quiz" });
  }
});

router.post("/start", async (req, res) => {
  try {
    const { code, userId } = req.body;
    const quiz = await Quiz.findOne({ code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Verify creator
    if (quiz.createdBy !== userId) {
      return res.status(403).json({ error: "Only quiz creator can start the quiz" });
    }

    if (quiz.participants.length === 0) {
      return res.status(400).json({ error: "Cannot start quiz with no participants" });
    }

    // Update quiz status
    quiz.status = 'active';
    quiz.startTime = new Date();
    await quiz.save();

    // Send questions without answers
    const sanitizedQuestions = quiz.questions.map(q => ({
      text: q.text,
      type: q.type,
      options: q.options,
      timeLimit: q.timeLimit
    }));

    res.json({
      success: true,
      message: "Quiz started successfully",
      questions: sanitizedQuestions
    });
  } catch (error) {
    console.error('Start quiz error:', error);
    res.status(500).json({ error: "Failed to start quiz" });
  }
});

router.post("/submit-answer", async (req, res) => {
  try {
    const { code, userId, questionIndex, answer } = req.body;
    const quiz = await Quiz.findOne({ code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (quiz.status !== "active") {
      return res.status(400).json({ error: "Quiz is not active" });
    }

    const question = quiz.questions[questionIndex];
    if (!question) {
      return res.status(400).json({ error: "Invalid question index" });
    }

    const isCorrect = question.correctAnswer === answer;
    
    // Store the answer
    if (!quiz.answers) quiz.answers = [];
    quiz.answers.push({
      userId,
      questionIndex,
      answer,
      isCorrect,
      timestamp: new Date()
    });
    await quiz.save();

    res.json({ 
      success: true, 
      correct: isCorrect,
      correctAnswer: question.correctAnswer // Only send correct answer after submission
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({ error: "Failed to submit answer" });
  }
});

router.get("/list", async (req, res) => {
  try {
    const quizzes = await Quiz.find({}, {
      code: 1,
      title: 1,
      category: 1,
      status: 1,
      createdBy: 1,
      participantCount: { $size: "$participants" }
    });
    res.json(quizzes);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
});

router.post("/submit", async (req, res) => {
  try {
    const { code, userId, score } = req.body;
    const quiz = await Quiz.findOne({ code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    quiz.scores.push({ 
      userId, 
      score,
      submittedAt: new Date()
    });
    await quiz.save();
    
    res.json({ 
      message: "Score submitted successfully",
      currentRank: quiz.scores.filter(s => s.score > score).length + 1
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit score" });
  }
});

router.get("/leaderboard/:code", async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ code: req.params.code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const leaderboard = quiz.scores
      .sort((a, b) => b.score - a.score)
      .map((score, index) => ({
        ...score.toObject(),
        rank: index + 1
      }));

    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

module.exports = router;
