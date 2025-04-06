const router = require("express").Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

router.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hash });
    await user.save();
    res.json({ message: "SignUp Successful" });
  } catch (error) {
    res.status(500).json({ error: "Error creating user" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, "secretkey");
    res.json({ token, username: user.username });
  } catch (error) {
    res.status(500).json({ error: "Error during login" });
  }
});

module.exports = router;
