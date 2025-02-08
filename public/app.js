document.getElementById('wordForm').addEventListener('submit', function(event) {
    event.preventDefault();
    
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '<p class="loading">Checking your word, please wait...</p>';
    
    const wordInput = document.getElementById('wordInput');
    const word = wordInput.value.trim();
    
    // Validate input: letters only.
    if (!/^[a-zA-Z]+$/.test(word)) {
      resultDiv.innerHTML = '<p class="error">Please enter a valid word (alphabetical characters only).</p>';
      return;
    }
    
    fetch(`/api/check?word=${encodeURIComponent(word)}`)
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          resultDiv.innerHTML = `<p class="error">Error: ${data.error}</p>`;
          return;
        }
        
        let html = `<h2>Results for "${data.word}":</h2>`;
        html += `<p>Sorted letters: <strong>${data.sortedKey}</strong></p>`;
        html += `<p>Total unique arrangements: <strong>${data.totalPermutations}</strong></p>`;
        html += `<p>Number of valid English words found: <strong>${data.validCount}</strong></p>`;
        
        if (data.isPrime) {
            html += `
              <div class="prime-banner">
                <div class="prime-title">
                  <span class="xp">PRIME</span>
                </div>
                <p>Your word <strong>${data.word}</strong> has no anagrams other than itself.</p>
              </div>`;
          } else if (data.validCount > 0) {
          
          html += `<p>Legitimate anagrams (excluding your input):</p><ul class="anagram-list">`;
          const others = data.annotatedAnagrams.filter(item => item.word !== data.word);
          others.forEach(item => {
            let className = item.isCommon ? 'anagram-common' : 'anagram-archaic';
            html += `<li class="${className}"><strong>${item.word}</strong> - ${item.definition}</li>`;
          });
          html += `</ul>`;
        } else {
          html += `<p>No valid English words were found for the given letters.</p>`;
        }
        
        resultDiv.innerHTML = html;
      })
      .catch(err => {
        resultDiv.innerHTML = `<p class="error">Error: ${err.message}</p>`;
      });
});
