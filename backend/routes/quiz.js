const router = require("express").Router();
const Quiz = require("../models/Quiz");

function generateUniqueCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// Create Quiz endpoint
router.post("/create", async (req, res) => {
  try {
    const { title, category, questions, userId, createdBy, creatorName } = req.body;

    // Validate required fields
    if (!title || !category || !questions || !createdBy || !creatorName) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    // Generate a unique code
    const code = generateUniqueCode();

    // Create new quiz with updated schema
    const quiz = new Quiz({
      code,
      title,
      category,
      questions: questions.map(q => ({
        text: q.text,
        type: q.type,
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        timeLimit: q.timeLimit || 30
      })),
      createdBy,
      creatorName,
      status: 'pending',
      participants: []
    });

    await quiz.save();

    res.status(201).json({
      success: true,
      code: quiz.code,
      message: 'Quiz created successfully'
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
    const { userId } = req.query;
    const quiz = await Quiz.findOne({ code: req.params.code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Ensure questions exists and is an array before mapping
    const sanitizedQuestions = (quiz.questions || []).map(q => ({
      text: q.text,
      type: q.type,
      options: q.options || [],
      timeLimit: q.timeLimit || 30
    }));

    // Ensure participants exists before getting length
    const participantCount = quiz.participants ? quiz.participants.length : 0;

    res.json({
      code: quiz.code,
      title: quiz.title,
      category: quiz.category,
      questions: sanitizedQuestions,
      status: quiz.status,
      participantCount: participantCount,
      creatorName: quiz.creatorName,
      createdBy: quiz.createdBy,
      isCreator: quiz.createdBy === userId
    });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    res.status(500).json({ 
      error: "Failed to fetch quiz",
      details: error.message 
    });
  }
});

// Get quiz details for creator (with answers)
router.get("/:code/admin", async (req, res) => {
  try {
    const { createdBy } = req.body;
    const quiz = await Quiz.findOne({ code: req.params.code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (quiz.createdBy !== createdBy) {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    res.json(quiz);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch quiz details" });
  }
});

router.post("/join", async (req, res) => {
  try {
    const { code, userId, username } = req.body;
    
    // Validate required fields
    if (!code || !userId || !username) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    const quiz = await Quiz.findOne({ code });
    
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (quiz.status !== 'pending') {
      return res.status(400).json({ error: "Quiz has already started" });
    }

    // Check if user already exists in participants
    const existingParticipant = quiz.participants.find(p => p.userId === userId);
    if (!existingParticipant) {
      // Create a new participant document that matches the schema
      const newParticipant = {
        userId: userId,
        username: username,
        score: 0
      };

      // Use findOneAndUpdate to atomically update the quiz
      const updatedQuiz = await Quiz.findOneAndUpdate(
        { code },
        { 
          $push: { participants: newParticipant }
        },
        { 
          new: true,      // Return the updated document
          runValidators: true  // Run schema validators
        }
      );

      if (!updatedQuiz) {
        return res.status(404).json({ error: "Failed to update quiz" });
      }

      // Sanitize questions for response
      const sanitizedQuestions = updatedQuiz.questions.map(q => ({
        text: q.text,
        type: q.type,
        options: q.options || [],
        timeLimit: q.timeLimit || 30
      }));

      return res.json({ 
        success: true,
        message: "Joined quiz successfully",
        quiz: {
          title: updatedQuiz.title,
          category: updatedQuiz.category,
          questions: sanitizedQuestions,
          participants: updatedQuiz.participants,
          participantCount: updatedQuiz.participants.length,
          status: updatedQuiz.status,
          creatorName: updatedQuiz.creatorName,
          createdBy: updatedQuiz.createdBy,
          code: updatedQuiz.code
        }
      });
    } else {
      // User already exists in participants, just return the quiz data
      const sanitizedQuestions = quiz.questions.map(q => ({
        text: q.text,
        type: q.type,
        options: q.options || [],
        timeLimit: q.timeLimit || 30
      }));

      return res.json({ 
        success: true,
        message: "Already joined quiz",
        quiz: {
          title: quiz.title,
          category: quiz.category,
          questions: sanitizedQuestions,
          participants: quiz.participants,
          participantCount: quiz.participants.length,
          status: quiz.status,
          creatorName: quiz.creatorName,
          createdBy: quiz.createdBy,
          code: quiz.code
        }
      });
    }
  } catch (error) {
    console.error("Join quiz error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to join quiz",
      details: error.message 
    });
  }
});

router.post("/start", async (req, res) => {
  try {
    const { code, creatorName } = req.body; // Match the frontend request
    
    console.log("Start quiz request:", { code, creatorName }); // Debug log
    
    if (!code || !creatorName) {
      return res.status(400).json({ 
        success: false,
        error: "Missing required fields" 
      });
    }

    const quiz = await Quiz.findOne({ code });
    
    if (!quiz) {
      return res.status(404).json({ 
        success: false,
        error: "Quiz not found" 
      });
    }

    // Verify creator using creatorName
    if (quiz.creatorName !== creatorName) {
      return res.status(403).json({ 
        success: false,
        error: "Only quiz creator can start the quiz" 
      });
    }

    if (quiz.status === 'active') {
      return res.status(400).json({ 
        success: false,
        error: "Quiz is already started" 
      });
    }

    if (quiz.participants.length < 1) {
      return res.status(400).json({ 
        success: false,
        error: "Cannot start quiz with no participants" 
      });
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
      timeLimit: q.timeLimit || 30 // Default time limit if not set
    }));

    res.json({
      success: true,
      message: "Quiz started successfully",
      questions: sanitizedQuestions
    });
  } catch (error) {
    console.error('Start quiz error:', error);
    res.status(500).json({ 
      success: false,
      error: "Failed to start quiz",
      details: error.message 
    });
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
      createdBy: 1, // Changed from createdBy
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

    // Get scores from participants instead of scores array
    const leaderboard = quiz.participants
      .map(participant => ({
        userId: participant.userId,
        username: participant.username,
        score: participant.score || 0
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    res.json({
      success: true,
      leaderboard,
      quizTitle: quiz.title,
      quizStatus: quiz.status
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch leaderboard",
      details: error.message 
    });
  }
});

router.post("/:code/end", async (req, res) => {
  try {
    const { code, createdBy } = req.body;
    
    // Only check for code and createdBy
    if (!code || !createdBy) {
      return res.status(400).json({ 
        success: false,
        error: "Missing required fields" 
      });
    }

    const quiz = await Quiz.findOne({ code });
    
    if (!quiz) {
      return res.status(404).json({ 
        success: false,
        error: "Quiz not found" 
      });
    }

    // Strict verification that only the creator can end the quiz
    if (quiz.createdBy !== createdBy) {
      return res.status(403).json({ 
        success: false,
        error: "Only quiz creator can end the quiz" 
      });
    }

    if (quiz.status === 'completed') {
      return res.status(400).json({ 
        success: false,
        error: "Quiz is already completed" 
      });
    }

    // Update quiz status
    quiz.status = 'completed';
    quiz.endTime = new Date();
    await quiz.save();

    // Calculate final scores and rankings
    const finalScores = quiz.participants.map(participant => ({
      userId: participant.userId,
      username: participant.username,
      score: participant.score
    })).sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      message: "Quiz ended successfully",
      finalScores
    });

  } catch (error) {
    console.error('End quiz error:', error);
    res.status(500).json({ 
      success: false,
      error: "Failed to end quiz",
      details: error.message 
    });
  }
});

module.exports = router;
