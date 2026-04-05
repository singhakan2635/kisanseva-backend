const mongoose = require('mongoose');
const fs = require('fs');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const data = JSON.parse(fs.readFileSync('/tmp/kisanseva_export.json', 'utf8'));
  
  for (const [collection, docs] of Object.entries(data)) {
    if (!docs.length) continue;
    const col = db.collection(collection);
    const existing = await col.countDocuments();
    if (existing > 0) {
      console.log(`${collection}: already has ${existing} docs, skipping`);
      continue;
    }
    await col.insertMany(docs);
    console.log(`${collection}: inserted ${docs.length} docs`);
  }
  
  console.log('Done!');
  await mongoose.disconnect();
}
seed().catch(e => { console.error(e); process.exit(1); });
