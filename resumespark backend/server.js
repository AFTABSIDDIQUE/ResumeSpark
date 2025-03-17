const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const pdfParse = require("pdf-parse");
require("dotenv").config();

const app = express();
const port = 5000;
const upload = multer({ dest: "uploads/" });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(cors());
app.use(express.json());

app.post("/analyze", upload.single("resume"), async (req, res) => {
  if (!req.file || !req.body.jobDescription) {
    return res.status(400).json({ error: "Missing resume or job description." });
  }

  // Read and parse PDF file
  const pdfBuffer = fs.readFileSync(req.file.path);
  const pdfData = await pdfParse(pdfBuffer);
  const resumeText = pdfData.text;
  const jobDescription = req.body.jobDescription;

  // Define the prompt for Gemini
  const prompt = `
Analyze the given resume against the job description and return a JSON object with these fields:

{
  "score": "Numeric score out of 100",
  "strengths": ["List of strengths"],
  "weaknesses": ["List of weaknesses"],
  "projects": [
    {
      "strength": "Strength of project",
      "weakness": "Weakness of project"
    }
  ]
}

Ensure the output is valid JSON format without any extra text.

Resume:
${resumeText}

Job Description:
${jobDescription}
`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);

    // 🔹 Log the full response for debugging
    console.log("Gemini Response:", JSON.stringify(result, null, 2));

    // 🔹 Ensure candidates exist before accessing
    if (!result.response.candidates || result.response.candidates.length === 0) {
      throw new Error("No candidates returned from Gemini API.");
    }

    // Extract text safely
    const responseText = result.response.candidates[0].content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error("Gemini response does not contain valid text.");
    }

    // 🔹 Remove backticks using regex and extract JSON correctly
    const cleanJson = responseText.replace(/```json|```/g, "").trim();

    // 🔹 Parse JSON safely
    const jsonResponse = JSON.parse(cleanJson);

    res.json(jsonResponse);
  } catch (error) {
    console.error("Error analyzing resume:", error);
    res.status(500).json({ error: error.message });
  } finally {
    // Delete the uploaded file to clean up
    fs.unlinkSync(req.file.path);
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
