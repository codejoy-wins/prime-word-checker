
const fs = require("node:fs");
const path = require("node:path");

const dataPath = path.join(process.cwd(), "data", "anagrams.json");
const { anagrams, commonWords: commonList } = JSON.parse(
  fs.readFileSync(dataPath, "utf8")
);

const commonWords = new Set(commonList);
const MAX_CANDIDATES = 60;

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function totalUniquePermutations(word) {
  let result = factorial(word.length);
  const frequencies = {};

  for (const letter of word) {
    frequencies[letter] = (frequencies[letter] || 0) + 1;
  }

  for (const count of Object.values(frequencies)) {
    result /= factorial(count);
  }

  return result;
}

exports.handler = async function (event) {
  const word = (event.queryStringParameters?.word || "")
    .trim()
    .toLowerCase();

  if (!/^[a-z]{2,20}$/.test(word)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Enter a word containing 2–20 English letters."
      })
    };
  }

  const key = [...word].sort().join("");
  const allCandidates = [...(anagrams[key] || [])];

  allCandidates.sort((a, b) => {
    if (a === word) return -1;
    if (b === word) return 1;

    const commonDifference =
      Number(commonWords.has(b)) - Number(commonWords.has(a));

    return commonDifference || a.localeCompare(b);
  });

  const truncated = allCandidates.length > MAX_CANDIDATES;
  const candidates = allCandidates.slice(0, MAX_CANDIDATES);

  // This mode uses the locally bundled word lists.
  // It does not claim to have dictionary definitions.
  const annotatedAnagrams = candidates.map(candidate => ({
    word: candidate,
    isCommon: commonWords.has(candidate),
    definition: null
  }));

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      word,
      sortedKey: key,
      totalPermutations: totalUniquePermutations(word),
      annotatedAnagrams,
      validCount: annotatedAnagrams.length,
      isPrime:
        !truncated &&
        annotatedAnagrams.length === 1 &&
        annotatedAnagrams[0].word === word,
      truncated
    })
  };
};
