
const fs = require("node:fs");
const path = require("node:path");

const WORDS_URL =
  "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";

const COMMON_URL =
  "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt";

async function download(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${url} (${response.status})`);
  }

  return response.text();
}

function normalizeWords(text) {
  return text
    .split(/\r?\n/)
    .map(word => word.trim().toLowerCase())
    .filter(word => /^[a-z]{2,20}$/.test(word));
}

async function main() {
  console.log("Downloading word lists...");

  const [allText, commonText] = await Promise.all([
    download(WORDS_URL),
    download(COMMON_URL)
  ]);

  const words = [...new Set(normalizeWords(allText))];
  const commonWords = [...new Set(normalizeWords(commonText))];
  const commonSet = new Set(commonWords);
  const anagrams = {};

  for (const word of words) {
    const key = [...word].sort().join("");

    if (!anagrams[key]) anagrams[key] = [];
    anagrams[key].push(word);
  }

  for (const group of Object.values(anagrams)) {
    group.sort((a, b) => {
      const commonDifference =
        Number(commonSet.has(b)) - Number(commonSet.has(a));

      return commonDifference || a.localeCompare(b);
    });
  }

  const outputDir = path.join(__dirname, "..", "data");
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, "anagrams.json"),
    JSON.stringify({ anagrams, commonWords })
  );

  console.log(`Built index for ${words.length} words.`);
  console.log(`Built ${Object.keys(anagrams).length} anagram groups.`);
}

main().catch(error => {
  console.error("Dictionary build failed:", error);
  process.exitCode = 1;
});
