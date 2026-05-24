const {
  analyzeFoodImage,
  getDetailedRecipe,
  searchFoodByName,
} = require("../services/aiService");

const processFoodImage = async (req, res) => {
  try {
    if (!req.body.image) {
      return res.status(400).json({ error: "Rasm yuborilmadi" });
    }

    const result = await analyzeFoodImage(req.body.image);

    if (!result?.is_food) {
      return res.status(422).json({
        is_food: false,
        error: result?.reason || "Rasmda ovqat aniqlanmadi",
      });
    }

    return res.json(result);
  } catch (error) {
    console.error("Controller xatosi:", error);
    return res.status(500).json({ error: "Serverda xatolik yuz berdi" });
  }
};

const processRecipe = async (req, res) => {
  try {
    const { name, ingredients } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Ovqat nomi yuborilmadi" });
    }

    const result = await getDetailedRecipe(name, ingredients || []);
    return res.json(result);
  } catch (error) {
    console.error("Retsept xatosi:", error);
    return res
      .status(500)
      .json({ error: "Retsept yaratishda xatolik yuz berdi" });
  }
};

const processFoodSearch = async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: "Qidiruv so'zi yuborilmadi" });
    }

    const result = await searchFoodByName(query.trim());

    if (!result?.is_food) {
      return res.status(404).json({
        is_food: false,
        error: result?.error || "Bu nom bo'yicha ovqat topilmadi",
      });
    }

    return res.json(result);
  } catch (error) {
    console.error("Qidiruv xatosi:", error);
    return res
      .status(500)
      .json({ error: "Ovqatni qidirishda xatolik yuz berdi" });
  }
};

module.exports = {
  processFoodImage,
  processRecipe,
  processFoodSearch,
};
