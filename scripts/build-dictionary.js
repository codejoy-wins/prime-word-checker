const fs = require("node:fs");
const path = require("node:path");

const WORDS_URL =
  "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";

const COMMON_URL =
  "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt";

async function download(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }

  return response.text();
}

function letterKey(word) {
  return [...word].sort().join("");
}

async function main() {
  console.log("Downloading word sources...");

  const [wordText, commonText] = await Promise.all([
    download(WORDS_URL),
    download(COMMON_URL)
  ]);

  const commonWords = new Set(
    commonText
      .split(/\r?\n/)
      .map(word => word.trim().toLowerCase())
      .filter(word => /^[a-z]+$/.test(word))
  );

  const anagrams = Object.create(null);

  for (const rawWord of wordText.split(/\r?\n/)) {
    const word = rawWord.trim().toLowerCase();

    if (!/^[a-z]{2,20}$/.test(word)) continue;

    const key = letterKey(word);

    if (!anagrams[key]) anagrams[key] = [];
    anagrams[key].push(word);
  }

  const output = {
    anagrams,
    commonWords: [...commonWords]
  };

  const outputPath = path.join(__dirname, "..", "data", "anagrams.json");

  fs.writeFileSync(outputPath, JSON.stringify(output));

  console.log(`Prepared ${Object.keys(anagrams).length} letter groups.`);
  console.log(`Saved index to ${outputPath}`);
}

main().catch(error => {
  console.error("Dictionary build failed:", error);
  process.exit(1);
});