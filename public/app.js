const form = document.getElementById("wordForm");
const input = document.getElementById("wordInput");
const result = document.getElementById("result");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  const word = input.value.trim();

  if (!word) {
    result.innerHTML = "<p>Please enter a word.</p>";
    return;
  }

  result.innerHTML = "<p>Finding anagrams…</p>";

  try {
    const response = await fetch(
      `/api/check?word=${encodeURIComponent(word)}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "The search could not be completed.");
    }

    const otherAnagrams = data.annotatedAnagrams.filter(
      item => item.word !== data.word
    );

    let html = `
      <h2>Results for ${escapeHtml(data.word.toUpperCase())}</h2>
      <p>Alphabetized letters: <strong>${escapeHtml(data.sortedKey)}</strong></p>
      <p>Possible letter arrangements: ${data.totalPermutations.toLocaleString()}</p>
      <p>Valid words found: ${data.validCount}</p>
    `;

    if (data.isPrime) {
      html += `
        <div class="prime-banner">
          <div class="prime-title">PRIME</div>
          <p>No other word with these letters was found in the checked word list.</p>
        </div>
      `;
    } else if (otherAnagrams.length) {
      html += "<h2>Valid Anagrams</h2><ul class='anagram-list'>";

      for (const item of otherAnagrams) {
        const wordClass = item.isCommon
          ? "anagram-common"
          : "anagram-archaic";

        const definition = item.definition == null
          ? "null"
          : item.definition === ""
            ? '""'
            : item.definition;

        html += `
          <li>
            <strong class="${wordClass}">${escapeHtml(item.word.toUpperCase())}</strong>
            <p>${escapeHtml(definition)}</p>
          </li>
        `;
      }

      html += "</ul>";
    } else {
      html += "<p>No other matching words were found in the checked word list.</p>";
    }

    if (data.truncated) {
      html += `
        <p>Note: This letter combination has many candidates.
        Only the first group of candidates was checked, so results are
        incomplete and PRIME status is withheld.</p>
      `;
    }

    result.innerHTML = html;
  } catch (error) {
    result.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
});