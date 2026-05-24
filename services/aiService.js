const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const FOODS_PATH = path.join(__dirname, "../data/foods.json");
const GEMINI_MODEL = "gemini-2.5-flash";

function getGeminiKeys() {
  return [
    process.env.GEMINI_API_KEY1,
    process.env.GEMINI_API_KEY2,
    process.env.GEMINI_API_KEY3,
    process.env.GEMINI_API_KEY4,
    process.env.GEMINI_API_KEY,
  ]
    .map((key) => (key || "").trim())
    .filter(Boolean);
}

function loadFoods() {
  try {
    const raw = fs.readFileSync(FOODS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("foods.json o'qishda xatolik:", error.message);
    return [];
  }
}

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/ʻ/g, "'")
    .replace(/’/g, "'")
    .replace(/`/g, "'")
    .replace(/‘/g, "'")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchFoodByName(query = "") {
  const foods = loadFoods();
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return null;

  const found = foods.find((food) => {
    const names = [
      food.name,
      food.id,
      ...(Array.isArray(food.aliases) ? food.aliases : []),
    ]
      .filter(Boolean)
      .map(normalizeText);

    return names.some((name) => {
      return (
        name === normalizedQuery ||
        name.includes(normalizedQuery) ||
        normalizedQuery.includes(name)
      );
    });
  });

  if (!found) return null;

  return {
    ...found,
    is_food: found.is_food !== false,
    description: found.description || found.recipe || "",
    ingredients: Array.isArray(found.ingredients) ? found.ingredients : [],
    steps: Array.isArray(found.steps) ? found.steps : [],
    source: "json",
  };
}

function cleanJsonText(text = "") {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function safeJsonParse(text = "") {
  const cleaned = cleanJsonText(text);

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }

    throw new Error("AI noto'g'ri JSON qaytardi");
  }
}

function shouldTryNextKey(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("rate") ||
    message.includes("limit") ||
    message.includes("api key") ||
    message.includes("apikey") ||
    message.includes("permission") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("403") ||
    message.includes("401") ||
    message.includes("404") ||
    message.includes("500") ||
    message.includes("503")
  );
}

async function runGeminiWithFallback(task) {
  const keys = getGeminiKeys();

  if (!keys.length) {
    throw new Error(
      "Gemini API key topilmadi. Render Environment yoki .env ichiga GEMINI_API_KEY1 yozing.",
    );
  }

  let lastError = null;

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];

    try {
      console.log(`Gemini API key ${i + 1} bilan so'rov yuborilmoqda...`);
      return await task(apiKey);
    } catch (error) {
      lastError = error;

      console.error(
        `Gemini API key ${i + 1} ishlamadi:`,
        error?.message || error,
      );

      if (!shouldTryNextKey(error)) {
        throw error;
      }

      if (i < keys.length - 1) {
        console.log("Keyingi Gemini API key sinab ko'rilmoqda...");
      }
    }
  }

  throw lastError || new Error("Barcha Gemini API keylar ishlamadi.");
}

function getGeminiModel(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);

  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
  });
}

async function analyzeFoodImage(imageBase64, mimeType = "image/jpeg") {
  return runGeminiWithFallback(async (apiKey) => {
    const model = getGeminiModel(apiKey);

    const prompt = `
Sen ovqat rasmini tahlil qiladigan yordamchisan.

Vazifa:
1. Rasmda ovqat bor yoki yo'qligini aniqlagin.
2. Agar ovqat bo'lmasa, is_food false qaytar.
3. Agar ovqat bo'lsa, taom nomi, qisqa ta'rifi va masalliqlarini qaytar.
4. Faqat JSON qaytar. Markdown, izoh, qo'shimcha matn yozma.

JSON formati:
{
  "is_food": true,
  "name": "Taom nomi",
  "description": "Qisqa ta'rif",
  "ingredients": ["Masalliq 1", "Masalliq 2"],
  "steps": []
}

Agar rasmda ovqat bo'lmasa:
{
  "is_food": false,
  "name": "",
  "description": "Bu rasmda ovqat aniqlanmadi.",
  "ingredients": [],
  "steps": []
}
`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType,
        },
      },
    ]);

    const text = result.response.text();
    const parsed = safeJsonParse(text);

    if (!parsed.is_food) {
      return {
        is_food: false,
        name: "",
        description: parsed.description || "Bu rasmda ovqat aniqlanmadi.",
        ingredients: [],
        steps: [],
        source: "ai",
      };
    }

    return {
      is_food: true,
      name: parsed.name || "Noma'lum taom",
      description: parsed.description || "Taom haqida qisqa ma'lumot topildi.",
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      source: "ai",
    };
  });
}

async function searchFoodWithAI(query) {
  return runGeminiWithFallback(async (apiKey) => {
    const model = getGeminiModel(apiKey);

    const prompt = `
Foydalanuvchi ovqat nomi bilan qidirmoqda: "${query}"

Vazifa:
1. Bu nom ovqatga tegishlimi aniqlagin.
2. Agar ovqat bo'lmasa, is_food false qaytar.
3. Agar ovqat bo'lsa, taom nomi, description, ingredients va tayyorlash steps qaytar.
4. Faqat JSON qaytar. Markdown yoki ortiqcha matn yozma.
5. Javob o'zbek tilida bo'lsin.

JSON formati:
{
  "is_food": true,
  "name": "Taom nomi",
  "description": "Qisqa ta'rif",
  "ingredients": ["Masalliq 1", "Masalliq 2"],
  "steps": ["1-qadam", "2-qadam", "3-qadam"]
}

Agar ovqat bo'lmasa:
{
  "is_food": false,
  "name": "",
  "description": "Bu ovqat nomi topilmadi.",
  "ingredients": [],
  "steps": []
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = safeJsonParse(text);

    if (!parsed.is_food) {
      return {
        is_food: false,
        name: "",
        description: parsed.description || "Bu ovqat nomi topilmadi.",
        ingredients: [],
        steps: [],
        source: "ai",
      };
    }

    return {
      is_food: true,
      name: parsed.name || query,
      description: parsed.description || "",
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      source: "ai",
    };
  });
}

async function getDetailedRecipe(foodName, ingredients = []) {
  const foodFromJson = searchFoodByName(foodName);

  if (foodFromJson && foodFromJson.steps && foodFromJson.steps.length > 0) {
    return {
      is_food: true,
      name: foodFromJson.name,
      description: foodFromJson.description || "",
      ingredients: foodFromJson.ingredients || [],
      steps: foodFromJson.steps || [],
      source: "json",
    };
  }

  return runGeminiWithFallback(async (apiKey) => {
    const model = getGeminiModel(apiKey);

    const ingredientsText = Array.isArray(ingredients)
      ? ingredients.join(", ")
      : "";

    const prompt = `
"${foodName}" taomini tayyorlash ketma-ketligini yoz.

Masalliqlar:
${ingredientsText || "Masalliqlar noma'lum"}

Vazifa:
1. Taom nomi, qisqa description, ingredients va steps qaytar.
2. Steps aniq, ketma-ket va amaliy bo'lsin.
3. Javob o'zbek tilida bo'lsin.
4. Faqat JSON qaytar. Markdown yoki qo'shimcha matn yozma.

JSON formati:
{
  "is_food": true,
  "name": "${foodName}",
  "description": "Qisqa ta'rif",
  "ingredients": ["Masalliq 1", "Masalliq 2"],
  "steps": ["1-qadam", "2-qadam", "3-qadam"]
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = safeJsonParse(text);

    return {
      is_food: true,
      name: parsed.name || foodName,
      description: parsed.description || "",
      ingredients: Array.isArray(parsed.ingredients)
        ? parsed.ingredients
        : Array.isArray(ingredients)
          ? ingredients
          : [],
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      source: "ai",
    };
  });
}

module.exports = {
  searchFoodByName,
  analyzeFoodImage,
  searchFoodWithAI,
  getDetailedRecipe,

  getDetailedRecipeFromAI: getDetailedRecipe,
  searchFoodByNameWithAI: searchFoodWithAI,
};
