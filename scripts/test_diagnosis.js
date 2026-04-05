const mongoose = require("mongoose");
const Anthropic = require("@anthropic-ai/sdk");

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log("DB diseases:", await db.collection("diseases").countDocuments());

  const client = new Anthropic.default();

  const cases = [
    "Rice with diamond-shaped gray lesions and brown borders on leaves",
    "Tomato with dark brown water-soaked lesions and white fuzzy growth underneath",
    "Mango leaves with black spots and velvety dark coating",
    "Coffee plant with orange rust-colored powdery spots on underside of leaves",
    "Apple fruit with dark sunken lesions in concentric rings",
  ];

  console.log("\n===== DIAGNOSIS TEST =====\n");

  for (const desc of cases) {
    const r = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: 'Identify the plant disease. Return ONLY JSON: {"disease":"name","confidence":0.9}. Description: ' + desc }],
    });

    try {
      const text = r.content[0].text;
      const j = JSON.parse(text.match(/\{[^}]+\}/)[0]);

      // Fuzzy search in DB
      const words = j.disease.split(/\s+/).filter(w => w.length > 3);
      const regex = words.slice(0, 2).join(".*");
      const m = await db.collection("diseases").findOne({ name: { $regex: regex, $options: "i" } });

      const tx = m && m.treatments && m.treatments.chemical ? m.treatments.chemical.length : 0;

      console.log("Input:     ", desc);
      console.log("Claude:    ", j.disease, "(" + Math.round(j.confidence * 100) + "%)");
      console.log("DB Match:  ", m ? m.name : "NOT FOUND");
      console.log("Treatments:", tx > 0 ? tx + " chemical treatments" : "NONE");
      console.log("");
    } catch (e) {
      console.log("Input:", desc);
      console.log("ERROR:", e.message);
      console.log("");
    }
  }

  await mongoose.disconnect();
}

test().catch((e) => { console.error(e); process.exit(1); });
