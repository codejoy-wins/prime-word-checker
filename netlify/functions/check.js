
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

function extractDefinition(entry) {
  for (const etymology of entry?.etymologies || []) {
    for (const part of etymology.partsOfSpeech || []) {
      for (const sense of part.senses || []) {
        if (sense.sense) {
          return sense.sense.replace(/<[^>]*>/g, "").trim();
        }
      }
    }
  }

  return "";
}

async function fetchDefinitions(words) {
  const fileCache = new Map();

  async function fetchDictionaryFile(word) {
    const prefix = word.slice(0, 2);

    if (!fileCache.has(prefix)) {
      const url =
        `https://raw.githubusercontent.com/mhollingshead/open-dictionary/main/api/${word[0]}/${prefix}.json`;

      fileCache.set(
        prefix,
        fetch(url)
          .then(async response => {
            if (!response.ok) return {};
            return response.json();
          })
          .catch(error => {
            console.error(`Dictionary file "${prefix}" failed:`, error.message);
            return {};
          })
      );
    }

    return fileCache.get(prefix);
  }

  await Promise.all(
    words.map(async item => {
      try {
        const dictionary = await fetchDictionaryFile(item.word);
        item.definition = extractDefinition(dictionary[item.word]);
      } catch (error) {
        console.error(`Definition lookup failed for "${item.word}":`, error.message);
      }
    })
  );
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
        error: "Enter a word using 2–20 English letters, with no spaces or numbers."
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

  const annotatedAnagrams = candidates.map(candidate => ({
    word: candidate,
    isCommon: commonWords.has(candidate),
    definition: ""
  }));

  await fetchDefinitions(
    annotatedAnagrams.filter(item => item.word !== word)
  );

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
      truncated,
      resultTitle: "Results for " + word.toUpperCase(),
      letterLabel: "Alphabetized letters",
      permutationLabel: "Possible letter arrangements",
      wordCountLabel: "Valid words found",
      anagramHeading: "Valid Anagrams",
      primeLabel: "Prime Word"
    })
  };
};
