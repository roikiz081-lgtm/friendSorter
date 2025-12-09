/** @type {ItemData} */
let itemData       = [];   // Initial item data set used.
/** @type {ItemData} */
let itemDataToSort = [];   // Item data set after filtering.
/** @type {Options} */
let options             = [];   // Initial option set used.

let currentVersion      = '';   // Which version of itemData and options are used.

/** @type {(boolean|boolean[])[]} */
let optTaken  = [];             // Records which options are set.

/** Save Data. Concatenated into array, joined into string (delimited by '|') and compressed with lz-string. */
let timestamp = 0;        // savedata[0]      (Unix time when sorter was started, used as initial PRNG seed and in dataset selection)
let timeTaken = 0;        // savedata[1]      (Number of ms elapsed when sorter ends, used as end-of-sort flag and in filename generation)
let choices   = '';       // savedata[2]      (String of '0' and '1' that records what sorter choices are made)
let optStr    = '';       // savedata[3]      (String of '0' and '1' that denotes top-level option selection)
let suboptStr = '';       // savedata[4...n]  (String of '0' and '1' that denotes nested option selection, separated by '|')
let timeError = false;    // Shifts entire savedata array to the right by 1 and adds an empty element at savedata[0] if true.

/** Point-based sorter data. */
let itemPoints = [];     // Points for each item (indexed by itemDataToSort index)
let leftItemIndex = -1;   // Index of left item currently shown
let rightItemIndex = -1;  // Index of right item currently shown
let comparisonNo = 0;      // Number of comparisons made
let totalComparisons = 0; // Total number of comparisons to make
let comparisonHistory = []; // History for undo: [{left, right, choice}]

/** A copy of sorter data is recorded for undo() purposes. */
let itemPointsPrev = [];
let leftItemIndexPrev = -1;
let rightItemIndexPrev = -1;
let comparisonNoPrev = 0;
let comparisonHistoryPrev = [];

/** Miscellaneous sorter data that doesn't need to be saved for undo(). */
let finalItems = [];
let loading         = false;
let sorterURL       = window.location.host + window.location.pathname;
let storedSaveType  = localStorage.getItem(`${sorterURL}_saveType`);

/** Initialize script. */
let selectedMode = 'ERP';
function init() {

  /** Define button behavior. */
  document.querySelector('.starting.start.button').addEventListener('click', start);
  document.querySelector('.starting.load.button').addEventListener('click', loadProgress);

  document.querySelector('.left.sort.image').addEventListener('click', () => pick('left'));
  document.querySelector('.right.sort.image').addEventListener('click', () => pick('right'));
  
  document.querySelector('.sorting.tie.button').addEventListener('click', () => pick('tie'));
  document.querySelector('.sorting.undo.button').addEventListener('click', undo);
  document.querySelector('.sorting.save.button').addEventListener('click', () => saveProgress('Progress'));
  
  document.querySelector('.finished.save.button').addEventListener('click', () => saveProgress('Last Result'));
  document.querySelector('.finished.getimg.button').addEventListener('click', generateJSON);
  document.querySelector('.finished.list.button').addEventListener('click', generateTextList);

  document.querySelector('.clearsave').addEventListener('click', clearProgress);

  /** Define keyboard controls (up/down/left/right vimlike k/j/h/l). */
  document.addEventListener('keypress', (ev) => {
    /** If sorting is in progress. */
    if (timestamp && !timeTaken && !loading && leftItemIndex >= 0 && rightItemIndex >= 0) {
      switch(ev.key) {
        case 's': case '3':                   saveProgress('Progress'); break;
        case 'h': case 'ArrowLeft':           pick('left'); break;
        case 'l': case 'ArrowRight':          pick('right'); break;
        case 'k': case '1': case 'ArrowUp':   pick('tie'); break;
        case 'j': case '2': case 'ArrowDown': undo(); break;
        default: break;
      }
    }
    /** If sorting has ended. */
    else if (timeTaken && comparisonNo >= totalComparisons) {
      switch(ev.key) {
        case 'k': case '1': saveProgress('Last Result'); break;
        case 'j': case '2': generateJSON(); break;
        case 's': case '3': generateTextList(); break;
        default: break;
      }
    } else { // If sorting hasn't started yet.
      switch(ev.key) {
        case '1': case 's': case 'Enter': start(); break;
        case '2': case 'l':               loadProgress(); break;
        default: break;
      }
    }
  });

  // Image selector removed - now showing images for all items

  /** Show load button if save data exists. */
  if (storedSaveType) {
    document.querySelector('.starting.load.button > span').insertAdjacentText('beforeend', storedSaveType);
    document.querySelectorAll('.starting.button').forEach(el => {
      el.style['grid-row'] = 'span 3';
      el.style.display = 'block';
    });
  }

  // Initialize center action / mode buttons (default: first selected)
  const modeBtns = document.querySelectorAll('.center-actions .half');
  if (modeBtns && modeBtns.length) {
    modeBtns.forEach((btn, idx) => {
      // Ensure a data-mode exists
      if (!btn.dataset.mode) btn.dataset.mode = idx === 0 ? 'ERP' : 'SPAM';
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedMode = btn.dataset.mode;
        // Update title to reflect current mode
        const siteTitle = document.querySelector('.site-title');
        if (siteTitle) {
          siteTitle.textContent = `Political Compass Sorter - ${selectedMode}`;
        }
      });
    });
    // Default selection and title update
    const sel = document.querySelector('.center-actions .half.selected');
    if (sel) {
      selectedMode = sel.dataset.mode;
      const siteTitle = document.querySelector('.site-title');
      if (siteTitle) {
        siteTitle.textContent = `Political Compass Sorter - ${selectedMode}`;
      }
    }
  }

  setLatestDataset();

  /** Decode query string if available. */
  if (window.location.search.slice(1) !== '') decodeQuery();
}

/** Begin sorting. */
function start() {
  /** Copy data into sorting array to filter. */
  itemDataToSort = itemData.slice(0);

  /** Check selected options and convert to boolean array form. */
  optTaken = [];

  options.forEach(opt => {
    if ('sub' in opt) {
      if (!document.getElementById(`cbgroup-${opt.key}`).checked) optTaken.push(false);
      else {
        const suboptArray = opt.sub.reduce((arr, val, idx) => {
          arr.push(document.getElementById(`cb-${opt.key}-${idx}`).checked);
          return arr;
        }, []);
        optTaken.push(suboptArray);
      }
    } else { optTaken.push(document.getElementById(`cb-${opt.key}`).checked); }
  });

  /** Convert boolean array form to string form. */
  optStr    = '';
  suboptStr = '';

  optStr = optTaken
    .map(val => !!val)
    .reduce((str, val) => {
      str += val ? '1' : '0';
      return str;
    }, optStr);
  optTaken.forEach(val => {
    if (Array.isArray(val)) {
      suboptStr += '|';
      suboptStr += val.reduce((str, val) => {
        str += val ? '1' : '0';
        return str;
      }, '');
    }
  });

  /** Filter out deselected nested criteria and remove selected criteria. */
  options.forEach((opt, index) => {
    if ('sub' in opt) {
      if (optTaken[index]) {
        const subArray = optTaken[index].reduce((subList, subBool, subIndex) => {
          if (subBool) { subList.push(options[index].sub[subIndex].key); }
          return subList;
        }, []);
        itemDataToSort = itemDataToSort.filter(item => {
          if (!(opt.key in item.opts)) console.warn(`Warning: ${opt.key} not set for ${item.name}.`);
          return opt.key in item.opts && item.opts[opt.key].some(key => subArray.includes(key));
        });
      }
    } else if (optTaken[index]) {
      itemDataToSort = itemDataToSort.filter(item => !item.opts[opt.key]);
    }
  });

  if (itemDataToSort.length < 2) {
    alert('Cannot sort with less than two items. Please reselect.');
    return;
  }

  /** Initialize point system. */
  timestamp = timestamp || new Date().getTime();
  if (new Date(timestamp) < new Date(currentVersion)) { timeError = true; }
  Math.seedrandom(timestamp);

  /** Initialize points for all items to 0. */
  itemPoints = itemDataToSort.map(() => 0);
  comparisonNo = 0;
  comparisonHistory = [];
  
  /** Calculate total comparisons: show each pair once (n*(n-1)/2 comparisons) */
  totalComparisons = Math.min(itemDataToSort.length * (itemDataToSort.length - 1) / 2, 100); // Cap at 100 comparisons for performance

  /** Disable all checkboxes and hide/show appropriate parts while we preload the images. */
  document.querySelectorAll('input[type=checkbox]').forEach(cb => cb.disabled = true);
  document.querySelectorAll('.starting.button').forEach(el => el.style.display = 'none');
  const centerActions = document.querySelector('.center-actions');
  if (centerActions) centerActions.style.display = 'none';
  document.querySelector('.loading.button').style.display = 'block';
  document.querySelector('.progress').style.display = 'block';
  loading = true;

  preloadImages().then(() => {
    loading = false;
    document.querySelector('.loading.button').style.display = 'none';
    document.querySelectorAll('.sorting.button').forEach(el => el.style.display = 'block');
    document.querySelectorAll('.sort.text').forEach(el => el.style.display = 'block');
    selectNextPair();
    display();
  });
}

/** Select next pair of items to compare. */
function selectNextPair() {
  if (comparisonNo >= totalComparisons) {
    finishSorting();
    return;
  }

  /** Generate random pair that hasn't been compared yet. */
  let attempts = 0;
  do {
    leftItemIndex = Math.floor(Math.random() * itemDataToSort.length);
    rightItemIndex = Math.floor(Math.random() * itemDataToSort.length);
    attempts++;
  } while ((leftItemIndex === rightItemIndex || 
            comparisonHistory.some(h => 
              (h.left === leftItemIndex && h.right === rightItemIndex) ||
              (h.left === rightItemIndex && h.right === leftItemIndex)
            )) && attempts < 100);

  if (leftItemIndex === rightItemIndex) {
    finishSorting();
    return;
  }
}

/** Displays the current state of the sorter. */
function display() {
  if (leftItemIndex < 0 || rightItemIndex < 0 || comparisonNo >= totalComparisons) {
    return;
  }

  const percent = Math.floor(comparisonNo * 100 / totalComparisons);
  const leftItem = itemDataToSort[leftItemIndex];
  const rightItem = itemDataToSort[rightItemIndex];

  const itemNameDisp = name => {
    const itemName = reduceTextWidth(name, 'Arial 12.8px', 220);
    const itemTooltip = name !== itemName ? name : '';
    return `<p title="${itemTooltip}">${itemName}</p>`;
  };

  progressBar(`Comparison No. ${comparisonNo + 1} / ${totalComparisons}`, percent);

  document.querySelector('.left.sort.image').src = leftItem.img;
  document.querySelector('.right.sort.image').src = rightItem.img;

  document.querySelector('.left.sort.text').innerHTML = itemNameDisp(leftItem.name);
  document.querySelector('.right.sort.text').innerHTML = itemNameDisp(rightItem.name);

  /** Autopick if choice has been given. */
  if (choices.length > comparisonNo) {
    switch (Number(choices[comparisonNo])) {
      case 0: pick('left'); break;
      case 1: pick('right'); break;
      case 2: pick('tie'); break;
      default: break;
    }
  } else { saveProgress('Autosave'); }
}

/**
 * Pick between two items - click-based point system.
 * 
 * @param {'left'|'right'|'tie'} sortType
 */
function pick(sortType) {
  if ((timeTaken && comparisonNo >= totalComparisons) || loading) { return; }
  else if (!timestamp) { return start(); }
  if (leftItemIndex < 0 || rightItemIndex < 0) { return; }

  /** Save state for undo. */
  itemPointsPrev = itemPoints.slice(0);
  leftItemIndexPrev = leftItemIndex;
  rightItemIndexPrev = rightItemIndex;
  comparisonNoPrev = comparisonNo;
  comparisonHistoryPrev = comparisonHistory.slice(0);

  /** Record choice. */
  if (choices.length === comparisonNo) {
    if (sortType === 'left') {
      choices += '0';
    } else if (sortType === 'right') {
      choices += '1';
    } else if (sortType === 'tie') {
      choices += '2';
    }
  }

  /** Update points: clicked item gets +1, other gets -1. For ties, neither changes. */
  if (sortType === 'left') {
    itemPoints[leftItemIndex]++;
    itemPoints[rightItemIndex]--;
  } else if (sortType === 'right') {
    itemPoints[rightItemIndex]++;
    itemPoints[leftItemIndex]--;
  } else if (sortType === 'tie') {
    // When tied, neither item gains or loses points
    // Points remain unchanged
  }

  /** Record this comparison. */
  comparisonHistory.push({
    left: leftItemIndex,
    right: rightItemIndex,
    choice: sortType
  });

  comparisonNo++;

  /** Select next pair or finish. */
  if (comparisonNo >= totalComparisons) {
    finishSorting();
  } else {
    selectNextPair();
    display();
  }
}

/** Finish sorting and show results. */
function finishSorting() {
  timeTaken = timeTaken || new Date().getTime() - timestamp;
  progressBar(`Completed!`, 100);
  result();
}


/**
 * Modifies the progress bar.
 * 
 * @param {string} indicator
 * @param {number} percentage
 */
function progressBar(indicator, percentage) {
  document.querySelector('.progressbattle').innerHTML = indicator;
  document.querySelector('.progressfill').style.width = `${percentage}%`;
  document.querySelector('.progresstext').innerHTML = `${percentage}%`;
}

/**
 * Shows the result of the sorter, sorted by points.
 * Displays images for all items.
 */
function result() {
  document.querySelectorAll('.finished.button').forEach(el => el.style.display = 'block');
  document.querySelector('.image.selector').style.display = 'none'; // Hide selector since we show all images
  document.querySelector('.time.taken').style.display = 'block';
  
  document.querySelectorAll('.sorting.button').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.sort.text').forEach(el => el.style.display = 'none');
  document.querySelector('.options').style.display = 'none';
  document.querySelector('.info').style.display = 'none';

  const header = '<div class="result head"><div class="left">Rank</div><div class="right">Name (Points)</div></div>';
  const timeStr = `This sorter was completed on ${new Date(timestamp + timeTaken).toString()} and took ${msToReadableTime(timeTaken)}. <a href="${location.protocol}//${sorterURL}">Do another sorter?</a>`;
  
  const imgRes = (item, num, points) => {
    const itemName = reduceTextWidth(item.name, 'Arial 12px', 160);
    const itemTooltip = item.name !== itemName ? item.name : '';
    return `<div class="result image"><div class="left"><span>${num}</span></div><div class="right"><img src="${item.img}"><div><span title="${itemTooltip}">${itemName} (${points})</span></div></div></div>`;
  }

  const podiumRes = (item, num, points, position, isBottom = false) => {
    const itemName = reduceTextWidth(item.name, 'Arial 12px', 160);
    const itemTooltip = item.name !== itemName ? item.name : '';
    const bottomClass = isBottom ? ' podium-bottom' : '';
    return `<div class="podium-item podium-${position}${bottomClass}"><div class="podium-rank">#${num}</div><img src="${item.img}"><div class="podium-name" title="${itemTooltip}">${itemName}</div><div class="podium-points">${points} pts</div></div>`;
  }

  /** Sort items by points (descending). */
  const sortedItems = itemDataToSort.map((item, idx) => ({
    item: item,
    index: idx,
    points: itemPoints[idx]
  })).sort((a, b) => b.points - a.points);

  let rankNum       = 1;
  let tiedRankNum   = 1;

  const resultTable = document.querySelector('.results');
  const timeElem = document.querySelector('.time.taken');

  resultTable.innerHTML = '';
  timeElem.innerHTML = timeStr;
  finalItems = [];

  // Create wrapper for both podiums
  const podiumsWrapper = document.createElement('div');
  podiumsWrapper.className = 'podiums-wrapper';

  // Create podium section for top 3 (left side)
  if (sortedItems.length >= 3) {
    const topPodiumWrapper = document.createElement('div');
    topPodiumWrapper.className = 'podium-wrapper';
    
    const topPodiumSection = document.createElement('div');
    topPodiumSection.className = 'podium-container podium-top';
    
    // 2nd place (left)
    const second = sortedItems[1];
    topPodiumSection.insertAdjacentHTML('beforeend', podiumRes(second.item, 2, second.points, 'left', false));
    finalItems.push({ rank: 2, name: second.item.name, points: second.points });
    
    // 1st place (middle)
    const first = sortedItems[0];
    topPodiumSection.insertAdjacentHTML('beforeend', podiumRes(first.item, 1, first.points, 'middle', false));
    finalItems.push({ rank: 1, name: first.item.name, points: first.points });
    
    // 3rd place (right)
    const third = sortedItems[2];
    topPodiumSection.insertAdjacentHTML('beforeend', podiumRes(third.item, 3, third.points, 'right', false));
    finalItems.push({ rank: 3, name: third.item.name, points: third.points });
    
    topPodiumWrapper.appendChild(topPodiumSection);
    
    // Add lorem ipsum below top podium (mode-dependent label)
    const topLoremText = document.createElement('div');
    topLoremText.className = 'podium-lorem';
    topLoremText.innerHTML = `<strong>Pro-${selectedMode}</strong>`;
    topPodiumWrapper.appendChild(topLoremText);
    
    podiumsWrapper.appendChild(topPodiumWrapper);
    
    // Handle ties for top 3
    if (sortedItems[1].points === sortedItems[0].points) {
      tiedRankNum = 2;
    } else if (sortedItems[2].points === sortedItems[1].points) {
      tiedRankNum = 2;
    }
    rankNum = 4;
  } else if (sortedItems.length === 2) {
    const topPodiumWrapper = document.createElement('div');
    topPodiumWrapper.className = 'podium-wrapper';
    
    const topPodiumSection = document.createElement('div');
    topPodiumSection.className = 'podium-container podium-top';
    
    const first = sortedItems[0];
    topPodiumSection.insertAdjacentHTML('beforeend', podiumRes(first.item, 1, first.points, 'middle', false));
    finalItems.push({ rank: 1, name: first.item.name, points: first.points });
    
    const second = sortedItems[1];
    topPodiumSection.insertAdjacentHTML('beforeend', podiumRes(second.item, 2, second.points, 'left', false));
    finalItems.push({ rank: 2, name: second.item.name, points: second.points });
    
    topPodiumWrapper.appendChild(topPodiumSection);
    
    // Add lorem ipsum below top podium (mode-dependent label)
    const topLoremText = document.createElement('div');
    topLoremText.className = 'podium-lorem';
    topLoremText.innerHTML = `<strong>Pro-${selectedMode}</strong>`;
    topPodiumWrapper.appendChild(topLoremText);
    
    podiumsWrapper.appendChild(topPodiumWrapper);
    rankNum = 3;
  } else if (sortedItems.length === 1) {
    const topPodiumWrapper = document.createElement('div');
    topPodiumWrapper.className = 'podium-wrapper';
    
    const topPodiumSection = document.createElement('div');
    topPodiumSection.className = 'podium-container podium-top';
    
    const first = sortedItems[0];
    topPodiumSection.insertAdjacentHTML('beforeend', podiumRes(first.item, 1, first.points, 'middle', false));
    finalItems.push({ rank: 1, name: first.item.name, points: first.points });
    
    topPodiumWrapper.appendChild(topPodiumSection);
    
    // Add lorem ipsum below top podium (mode-dependent label)
    const topLoremText = document.createElement('div');
    topLoremText.className = 'podium-lorem';
    topLoremText.innerHTML = `<strong>Pro-${selectedMode}</strong>`;
    topPodiumWrapper.appendChild(topLoremText);
    
    podiumsWrapper.appendChild(topPodiumWrapper);
    rankNum = 2;
  }

  // Create podium section for bottom 3 (right side)
  const totalItems = sortedItems.length;
  if (totalItems >= 6) {
    const bottomPodiumWrapper = document.createElement('div');
    bottomPodiumWrapper.className = 'podium-wrapper';
    
    const bottomPodiumSection = document.createElement('div');
    bottomPodiumSection.className = 'podium-container podium-bottom';
    
    // Bottom 3: last, second-to-last, third-to-last
    const last = sortedItems[totalItems - 1];
    const secondLast = sortedItems[totalItems - 2];
    const thirdLast = sortedItems[totalItems - 3];
    
    // Calculate ranks - use array position + 1
    const lastRank = totalItems;
    const secondLastRank = totalItems - 1;
    const thirdLastRank = totalItems - 2;
    
    bottomPodiumSection.insertAdjacentHTML('beforeend', podiumRes(secondLast.item, secondLastRank, secondLast.points, 'left', true));
    bottomPodiumSection.insertAdjacentHTML('beforeend', podiumRes(last.item, lastRank, last.points, 'middle', true));
    bottomPodiumSection.insertAdjacentHTML('beforeend', podiumRes(thirdLast.item, thirdLastRank, thirdLast.points, 'right', true));
    
    bottomPodiumWrapper.appendChild(bottomPodiumSection);
    
    // Add lorem ipsum below bottom podium (mode-dependent label)
    const bottomLoremText = document.createElement('div');
    bottomLoremText.className = 'podium-lorem';
    bottomLoremText.innerHTML = `<strong>Anti-${selectedMode}</strong>`;
    bottomPodiumWrapper.appendChild(bottomLoremText);
    
    podiumsWrapper.appendChild(bottomPodiumWrapper);
  } else if (totalItems >= 3) {
    // If less than 6 items, show bottom items in podium
    const bottomPodiumWrapper = document.createElement('div');
    bottomPodiumWrapper.className = 'podium-wrapper';
    
    const bottomPodiumSection = document.createElement('div');
    bottomPodiumSection.className = 'podium-container podium-bottom';
    
    if (totalItems === 5) {
      const last = sortedItems[4];
      const secondLast = sortedItems[3];
      bottomPodiumSection.insertAdjacentHTML('beforeend', podiumRes(secondLast.item, 4, secondLast.points, 'left', true));
      bottomPodiumSection.insertAdjacentHTML('beforeend', podiumRes(last.item, 5, last.points, 'middle', true));
      
      bottomPodiumWrapper.appendChild(bottomPodiumSection);
      
      // Add lorem ipsum below bottom podium (mode-dependent label)
      const bottomLoremText = document.createElement('div');
      bottomLoremText.className = 'podium-lorem';
      bottomLoremText.innerHTML = `<strong>Anti-${selectedMode}</strong>`;
      bottomPodiumWrapper.appendChild(bottomLoremText);
      
      podiumsWrapper.appendChild(bottomPodiumWrapper);
    } else if (totalItems === 4) {
      const last = sortedItems[3];
      bottomPodiumSection.insertAdjacentHTML('beforeend', podiumRes(last.item, 4, last.points, 'middle', true));
      
      bottomPodiumWrapper.appendChild(bottomPodiumSection);
      
      // Add lorem ipsum below bottom podium (mode-dependent label)
      const bottomLoremText = document.createElement('div');
      bottomLoremText.className = 'podium-lorem';
      bottomLoremText.innerHTML = `<strong>Anti-${selectedMode}</strong>`;
      bottomPodiumWrapper.appendChild(bottomLoremText);
      
      podiumsWrapper.appendChild(bottomPodiumWrapper);
    }
  }

  resultTable.appendChild(podiumsWrapper);

  // Add header for remaining items
  if (sortedItems.length > 3) {
    const restHeader = document.createElement('div');
    restHeader.className = 'result head rest-header';
    restHeader.innerHTML = '<div class="left">Rank</div><div class="right">Name (Points)</div>';
    resultTable.appendChild(restHeader);
  }

  // Display remaining items normally (starting from 4th place)
  for (let idx = 3; idx < sortedItems.length; idx++) {
    const entry = sortedItems[idx];
    const item = entry.item;
    const points = entry.points;
    
    resultTable.insertAdjacentHTML('beforeend', imgRes(item, rankNum, points));
    finalItems.push({ rank: rankNum, name: item.name, points: points });

    /** Handle ties. */
    if (idx < sortedItems.length - 1) {
      if (sortedItems[idx + 1].points === points) {
        tiedRankNum++;
      } else {
        rankNum += tiedRankNum;
        tiedRankNum = 1;
      }
    }
  }
}

/** Undo previous choice. */
function undo() {
  if (timeTaken || comparisonNo === 0) { return; }

  /** Restore previous state. */
  itemPoints = itemPointsPrev.slice(0);
  leftItemIndex = leftItemIndexPrev;
  rightItemIndex = rightItemIndexPrev;
  comparisonNo = comparisonNoPrev;
  comparisonHistory = comparisonHistoryPrev.slice(0);

  /** Remove last choice. */
  if (choices.length > 0) {
    choices = choices.slice(0, -1);
  }

  display();
}

/** 
 * Save progress to local browser storage.
 * 
 * @param {'Autosave'|'Progress'|'Last Result'} saveType
*/
function saveProgress(saveType) {
  const saveData = generateSavedata();

  localStorage.setItem(`${sorterURL}_saveData`, saveData);
  localStorage.setItem(`${sorterURL}_saveType`, saveType);

  if (saveType !== 'Autosave') {
    const saveURL = `${location.protocol}//${sorterURL}?${saveData}`;
    const inProgressText = 'You may click Load Progress after this to resume, or use this URL.';
    const finishedText = 'You may use this URL to share this result, or click Load Last Result to view it again.';

    window.prompt(saveType === 'Last Result' ? finishedText : inProgressText, saveURL);
  }
}

/**
 * Load progress from local browser storage.
*/
function loadProgress() {
  const saveData = localStorage.getItem(`${sorterURL}_saveData`);

  if (saveData) decodeQuery(saveData);
}

/** 
 * Clear progress from local browser storage.
*/
function clearProgress() {
  storedSaveType = '';

  localStorage.removeItem(`${sorterURL}_saveData`);
  localStorage.removeItem(`${sorterURL}_saveType`);

  document.querySelectorAll('.starting.start.button').forEach(el => el.style['grid-row'] = 'span 6');
  document.querySelectorAll('.starting.load.button').forEach(el => el.style.display = 'none');
}

function generateJSON() {
  // Create JSON array from finalItems with name and points
  const jsonData = finalItems.map(item => ({
    name: item.name,
    points: item.points
  }));

  const jsonString = JSON.stringify(jsonData, null, 2);
  
  // Create a blob and download it
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const timeFinished = timestamp + timeTaken;
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  const finishDate = new Date(timeFinished - tzoffset);
  
  // Format: {MODE}-sort-{dd}-{mm}-{yyyy}-by-placeholder.json
  const dd = String(finishDate.getUTCDate()).padStart(2, '0');
  const mm = String(finishDate.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = finishDate.getUTCFullYear();
  const filename = `${selectedMode}-sort-${dd}-${mm}-${yyyy}-by-placeholder.json`;
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateTextList() {
  const data = finalItems.reduce((str, item) => {
    str += `${item.rank}. ${item.name} (${item.points} points)<br>`;
    return str;
  }, '');
  const oWindow = window.open("", "", "height=640,width=480");
  oWindow.document.write(data);
}

function generateSavedata() {
  const saveData = `${timeError?'|':''}${timestamp}|${timeTaken}|${choices}|${optStr}${suboptStr}`;
  return LZString.compressToEncodedURIComponent(saveData);
}

/** Retrieve latest item data and options from dataset. */
function setLatestDataset() {
  /** Set some defaults. */
  timestamp = 0;
  timeTaken = 0;
  choices   = '';

  const latestDateIndex = Object.keys(dataSet)
    .map(date => new Date(date))
    .reduce((latestDateIndex, currentDate, currentIndex, array) => {
      return currentDate > array[latestDateIndex] ? currentIndex : latestDateIndex;
    }, 0);
  currentVersion = Object.keys(dataSet)[latestDateIndex];

  itemData = dataSet[currentVersion].characterData; // Keep same structure for now
  options = dataSet[currentVersion].options;

  populateOptions();
}

/** Populate option list. */
function populateOptions() {
  const optList = document.querySelector('.options');
  const optInsert = (name, id, tooltip, checked = true, disabled = false) => {
    return `<div><label title="${tooltip?tooltip:name}"><input id="cb-${id}" type="checkbox" ${checked?'checked':''} ${disabled?'disabled':''}> ${name}</label></div>`;
  };
  const optInsertLarge = (name, id, tooltip, checked = true) => {
    return `<div class="large option"><label title="${tooltip?tooltip:name}"><input id="cbgroup-${id}" type="checkbox" ${checked?'checked':''}> ${name}</label></div>`;
  };

  /** Clear out any previous options. */
  optList.innerHTML = '';

  /** Insert sorter options and set grouped option behavior. */
  options.forEach(opt => {
    if ('sub' in opt) {
      optList.insertAdjacentHTML('beforeend', optInsertLarge(opt.name, opt.key, opt.tooltip, opt.checked));
      opt.sub.forEach((subopt, subindex) => {
        optList.insertAdjacentHTML('beforeend', optInsert(subopt.name, `${opt.key}-${subindex}`, subopt.tooltip, subopt.checked, opt.checked === false));
      });
      optList.insertAdjacentHTML('beforeend', '<hr>');

      const groupbox = document.getElementById(`cbgroup-${opt.key}`);

      groupbox.parentElement.addEventListener('click', () => {
        opt.sub.forEach((subopt, subindex) => {
          document.getElementById(`cb-${opt.key}-${subindex}`).disabled = !groupbox.checked;
          if (groupbox.checked) { document.getElementById(`cb-${opt.key}-${subindex}`).checked = true; }
        });
      });
    } else {
      optList.insertAdjacentHTML('beforeend', optInsert(opt.name, opt.key, opt.tooltip, opt.checked));
    }
  });
}

/**
 * Decodes compressed shareable link query string.
 * @param {string} queryString
 */
function decodeQuery(queryString = window.location.search.slice(1)) {
  let successfulLoad;

  try {
    /** 
     * Retrieve data from compressed string. 
     * @type {string[]}
     */
    const decoded = LZString.decompressFromEncodedURIComponent(queryString).split('|');
    if (!decoded[0]) {
      decoded.splice(0, 1);
      timeError = true;
    }

    timestamp = Number(decoded.splice(0, 1)[0]);
    timeTaken = Number(decoded.splice(0, 1)[0]);
    choices   = decoded.splice(0, 1)[0];

    const optDecoded    = decoded.splice(0, 1)[0];
    const suboptDecoded = decoded.slice(0);

    /** 
     * Get latest data set version from before the timestamp.
     * If timestamp is before or after any of the datasets, get the closest one.
     * If timestamp is between any of the datasets, get the one in the past, but if timeError is set, get the one in the future.
     */
    const seedDate = { str: timestamp, val: new Date(timestamp) };
    const dateMap = Object.keys(dataSet)
      .map(date => {
        return { str: date, val: new Date(date) };
      })
    const beforeDateIndex = dateMap
      .reduce((prevIndex, currDate, currIndex) => {
        return currDate.val < seedDate.val ? currIndex : prevIndex;
      }, -1);
    const afterDateIndex = dateMap.findIndex(date => date.val > seedDate.val);
    
    if (beforeDateIndex === -1) {
      currentVersion = dateMap[afterDateIndex].str;
    } else if (afterDateIndex === -1) {
      currentVersion = dateMap[beforeDateIndex].str;
    } else {
      currentVersion = dateMap[timeError ? afterDateIndex : beforeDateIndex].str;
    }

    options = dataSet[currentVersion].options;
    itemData = dataSet[currentVersion].characterData; // Keep same structure for now

    /** Populate option list and decode options selected. */
    populateOptions();

    let suboptDecodedIndex = 0;
    options.forEach((opt, index) => {
      if ('sub' in opt) {
        const optIsTrue = optDecoded[index] === '1';
        document.getElementById(`cbgroup-${opt.key}`).checked = optIsTrue;
        opt.sub.forEach((subopt, subindex) => {
          const subIsTrue = optIsTrue ? suboptDecoded[suboptDecodedIndex][subindex] === '1' : true;
          document.getElementById(`cb-${opt.key}-${subindex}`).checked = subIsTrue;
          document.getElementById(`cb-${opt.key}-${subindex}`).disabled = optIsTrue;
        });
        suboptDecodedIndex = suboptDecodedIndex + optIsTrue ? 1 : 0;
      } else { document.getElementById(`cb-${opt.key}`).checked = optDecoded[index] === '1'; }
    });

    successfulLoad = true;
  } catch (err) {
    console.error(`Error loading shareable link: ${err}`);
    setLatestDataset(); // Restore to default function if loading link does not work.
  }

  if (successfulLoad) { start(); }
}

/** 
 * Preloads images in the filtered item data and converts to base64 representation.
*/
function preloadImages() {
  const totalLength = itemDataToSort.length;
  let imagesLoaded = 0;

  const loadImage = async (src) => {
    // Try fetch first (works with http:// and https://)
    try {
      const blob = await fetch(src).then(res => {
        if (!res.ok) throw new Error(`Failed to load ${src}`);
        return res.blob();
      });
      return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = ev => {
          progressBar(`Loading Image ${++imagesLoaded}`, Math.floor(imagesLoaded * 100 / totalLength));
          res(ev.target.result);
        };
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      // Fallback: use Image object for file:// protocol
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/png');
            progressBar(`Loading Image ${++imagesLoaded}`, Math.floor(imagesLoaded * 100 / totalLength));
            resolve(dataURL);
          } catch (e) {
            // If canvas fails, just use the image src directly
            progressBar(`Loading Image ${++imagesLoaded}`, Math.floor(imagesLoaded * 100 / totalLength));
            resolve(src);
          }
        };
        img.onerror = () => {
          console.error(`Failed to load image: ${src}`);
          progressBar(`Loading Image ${++imagesLoaded}`, Math.floor(imagesLoaded * 100 / totalLength));
          resolve(src); // Use original src as fallback
        };
        img.src = src;
      });
    }
  };

  return Promise.all(itemDataToSort.map(async (item, idx) => {
    itemDataToSort[idx].img = await loadImage(imageRoot + item.img);
  }));
}

/**
 * Returns a readable time string from milliseconds.
 * 
 * @param {number} milliseconds
 */
function msToReadableTime (milliseconds) {
  let t = Math.floor(milliseconds/1000);
  const years = Math.floor(t / 31536000);
  t = t - (years * 31536000);
  const months = Math.floor(t / 2592000);
  t = t - (months * 2592000);
  const days = Math.floor(t / 86400);
  t = t - (days * 86400);
  const hours = Math.floor(t / 3600);
  t = t - (hours * 3600);
  const minutes = Math.floor(t / 60);
  t = t - (minutes * 60);
  const content = [];
	if (years) content.push(years + " year" + (years > 1 ? "s" : ""));
	if (months) content.push(months + " month" + (months > 1 ? "s" : ""));
	if (days) content.push(days + " day" + (days > 1 ? "s" : ""));
	if (hours) content.push(hours + " hour"  + (hours > 1 ? "s" : ""));
	if (minutes) content.push(minutes + " minute" + (minutes > 1 ? "s" : ""));
	if (t) content.push(t + " second" + (t > 1 ? "s" : ""));
  return content.slice(0,3).join(', ');
}

/**
 * Reduces text to a certain rendered width.
 *
 * @param {string} text Text to reduce.
 * @param {string} font Font applied to text. Example "12px Arial".
 * @param {number} width Width of desired width in px.
 */
function reduceTextWidth(text, font, width) {
  const canvas = reduceTextWidth.canvas || (reduceTextWidth.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = font;
  if (context.measureText(text).width < width * 0.8) {
    return text;
  } else {
    let reducedText = text;
    while (context.measureText(reducedText).width + context.measureText('..').width > width * 0.8) {
      reducedText = reducedText.slice(0, -1);
    }
    return reducedText + '..';
  }
}

window.onload = init;
