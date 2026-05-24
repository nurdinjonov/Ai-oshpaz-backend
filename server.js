const express = require("express");
const cors = require("cors");
require("dotenv").config();

const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Barcha API yo'nalishlari shu yerdan o'tadi
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
  res.send("AI Food Recipe API ishlamoqda! 🚀");
});

app.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT} portida ishga tushdi...`);
});
