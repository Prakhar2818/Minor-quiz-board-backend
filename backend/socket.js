const socketIO = require('socket.io');
const Quiz = require('./models/Quiz');

const socketHandler = (io) => {
  const rooms = new Map(); // Store room data

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    socket.on("join-room", ({ code, username, userId }) => {
      // Join the socket room
      socket.join(code);
      
      // Initialize room if it doesn't exist
      if (!rooms.has(code)) {
        rooms.set(code, {
          players: [],
          currentQuestion: 0,
          scores: new Map(),
          createdBy: userId,
          status: 'waiting'
        });
      }
      
      const room = rooms.get(code);
      
      // Create player object
      const player = { 
        username, 
        userId, 
        socketId: socket.id,
        score: 0
      };
      
      // Add player to room's player list
      room.players.push(player);
      
      // Store user data in socket for later use
      socket.username = username;
      socket.userId = userId;
      socket.quizCode = code;

      // Notify others in the room that a new player joined
      socket.to(code).emit("player-joined", { 
        username, 
        userId 
      });
      
      // Send updated player list to all clients in the room
      io.to(code).emit("player-list", room.players);
    });

    socket.on("start-quiz", async ({ code, userId }) => {
      try {
        const quiz = await Quiz.findOne({ code });
        if (!quiz) {
          socket.emit("quiz-error", { message: "Quiz not found" });
          return;
        }

        const room = rooms.get(code);
        if (!room) {
          socket.emit("quiz-error", { message: "Room not found" });
          return;
        }

        // Verify creator
        if (room.createdBy !== userId) {
          socket.emit("quiz-error", { message: "Only quiz creator can start the quiz" });
          return;
        }

        // Initialize room data for quiz
        room.currentQuestion = 0;
        room.scores = new Map();
        room.questions = quiz.questions;
        room.status = 'active';

        // Send first question to all players
        io.to(code).emit("quiz-started", {
          questions: quiz.questions.map(q => ({
            text: q.text,
            type: q.type,
            options: q.options
          }))
        });

        // Start the timer for the first question
        startQuestionTimer(code);
      } catch (error) {
        console.error('Start quiz error:', error);
        socket.emit("quiz-error", { message: "Failed to start quiz" });
      }
    });

    socket.on("submit-answer", ({ code, questionIndex, answer }) => {
      try {
        const room = rooms.get(code);
        if (!room || room.status !== 'active') {
          socket.emit("quiz-error", { message: "Quiz is not active" });
          return;
        }

        const question = room.questions[questionIndex];
        if (!question) {
          socket.emit("quiz-error", { message: "Invalid question index" });
          return;
        }

        const isCorrect = question.correctAnswer === answer;
        const score = isCorrect ? 10 : 0;
        
        // Update player's score
        const currentScore = room.scores.get(socket.username) || 0;
        room.scores.set(socket.username, currentScore + score);

        // Update player's score in players list
        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
          player.score += score;
        }

        // Send result to the player
        socket.emit("answer-result", { 
          correct: isCorrect,
          score: currentScore + score
        });

        // Notify others of submission
        socket.to(code).emit("player-submitted", {
          userId: socket.userId,
          username: socket.username
        });
      } catch (error) {
        console.error('Submit answer error:', error);
        socket.emit("quiz-error", { message: "Failed to submit answer" });
      }
    });

    socket.on("leave-room", () => {
      handlePlayerDisconnect(socket);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      handlePlayerDisconnect(socket);
    });
  });

  // Helper function to handle player disconnection
  function handlePlayerDisconnect(socket) {
    if (socket.quizCode) {
      const room = rooms.get(socket.quizCode);
      if (room) {
        // Remove player from room
        room.players = room.players.filter(p => p.socketId !== socket.id);
        
        // Notify others in the room
        socket.to(socket.quizCode).emit("player-left", {
          username: socket.username,
          userId: socket.userId
        });
        
        // Send updated player list
        io.to(socket.quizCode).emit("player-list", room.players);

        // Clean up empty rooms
        if (room.players.length === 0) {
          rooms.delete(socket.quizCode);
        }
      }
    }
  }

  // Helper function to manage question timer
  function startQuestionTimer(code) {
    const room = rooms.get(code);
    if (!room) return;

    const QUESTION_TIME = 30000; // 30 seconds

    setTimeout(() => {
      room.currentQuestion++;
      
      // Check if quiz is finished
      if (room.currentQuestion >= room.questions.length) {
        // Convert scores Map to array for final results
        const finalScores = Array.from(room.scores, ([username, score]) => ({
          username,
          score
        }));
        
        io.to(code).emit("quiz-ended", finalScores);
        rooms.delete(code);
      } else {
        // Move to next question
        io.to(code).emit("next-question", {
          question: room.questions[room.currentQuestion],
          questionNumber: room.currentQuestion + 1
        });
        startQuestionTimer(code);
      }
    }, QUESTION_TIME);
  }
};

module.exports = socketHandler;
