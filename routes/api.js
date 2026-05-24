const express = require("express");
const router = express.Router();
const {
  processFoodImage,
  processRecipe,
  processFoodSearch,
} = require("../controllers/foodController");

router.post("/analyze-food", processFoodImage);
router.post("/get-recipe", processRecipe);
router.post("/search-food", processFoodSearch);

module.exports = router;
