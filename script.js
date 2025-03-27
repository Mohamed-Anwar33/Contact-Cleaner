document.getElementById("processBtn").addEventListener("click", processFile);
let allContacts = [];
let uniqueContacts = [];

function processFile() {
  const fileInput = document.getElementById("contactFile");
  const file = fileInput.files[0];
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");

  if (!file) {
    alert("يرجى رفع ملف جهات الاتصال أولاً!");
    return;
  }

  progressContainer.classList.remove("d-none");
  progressBar.style.width = "0%";
  progressBar.setAttribute("aria-valuenow", 0);

  const reader = new FileReader();
  reader.onload = function (event) {
    const arrayBuffer = event.target.result;
    const uint8Array = new Uint8Array(arrayBuffer);

    let text;
    try {
      text = new TextDecoder("utf-8").decode(uint8Array);
      if (text.includes("�")) throw new Error("UTF-8 failed");
    } catch (e) {
      try {
        text = new TextDecoder("utf-16le").decode(uint8Array);
        if (text.includes("�")) throw new Error("UTF-16LE failed");
      } catch (e) {
        try {
          text = new TextDecoder("windows-1256").decode(uint8Array);
          if (text.includes("�")) throw new Error("Windows-1256 failed");
        } catch (e) {
          alert("تعذر قراءة الملف بسبب مشكلة في الترميز!");
          progressContainer.classList.add("d-none");
          return;
        }
      }
    }

    progressBar.style.width = "20%";
    progressBar.setAttribute("aria-valuenow", 20);

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    processContactsWithWorker(lines);
  };
  reader.readAsArrayBuffer(file);
}

function processContactsWithWorker(contacts) {
  const progressBar = document.getElementById("progressBar");
  allContacts = contacts.slice(0, 1000000);

  const worker = new Worker(
    URL.createObjectURL(
      new Blob(
        [
          `
        onmessage = function(e) {
            const contacts = e.data;
            const contactMap = new Map();
            const duplicates = [];

            contacts.forEach((contact, index) => {
                if (contactMap.has(contact)) {
                    contactMap.set(contact, contactMap.get(contact) + 1);
                    if (contactMap.get(contact) === 2) duplicates.push(contact);
                } else {
                    contactMap.set(contact, 1);
                }
                if (index % 10000 === 0) {
                    postMessage({ progress: (index / contacts.length) * 80 + 20 });
                }
            });

            const uniqueContacts = [...contactMap.keys()];
            postMessage({ duplicates, uniqueContacts, progress: 100 });
        };
    `,
        ],
        { type: "application/javascript" }
      )
    )
  );

  worker.onmessage = function (e) {
    const { progress, duplicates, uniqueContacts: uniques } = e.data;
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute("aria-valuenow", progress);

    if (progress === 100) {
      uniqueContacts = uniques;
      document.getElementById("progressContainer").classList.add("d-none");
      displayDuplicates(duplicates);
    }
  };

  worker.postMessage(allContacts);
}

function displayDuplicates(duplicates) {
  const duplicatesDiv = document.getElementById("duplicates");
  const duplicateCountSpan = document.getElementById("duplicateCount");
  const duplicateListDiv = document.getElementById("duplicateList");

  duplicateCountSpan.textContent = duplicates.length;
  duplicateListDiv.innerHTML = duplicates
    .map((dup) => `<p>${dup}</p>`)
    .join("");
  duplicatesDiv.classList.remove("d-none");

  document
    .getElementById("removeDuplicatesBtn")
    .addEventListener("click", () => {
      const loadingBar = document.getElementById("loadingBar");
      loadingBar.classList.remove("d-none");

      duplicatesDiv.classList.add("d-none");

      setTimeout(() => {
        loadingBar.classList.add("d-none");
        displayResults(allContacts.length, uniqueContacts);
      }, 2000);
    });
}

function displayResults(originalCount, uniqueContacts) {
  const resultsDiv = document.getElementById("results");
  const originalCountSpan = document.getElementById("originalCount");
  const uniqueCountSpan = document.getElementById("uniqueCount");
  const contactListDiv = document.getElementById("contactList");

  originalCountSpan.textContent = originalCount;
  uniqueCountSpan.textContent = uniqueContacts.length;
  contactListDiv.innerHTML = uniqueContacts
    .map((contact) => `<p>${contact}</p>`)
    .join("");

  // إظهار البانر وإخفاؤه بعد 3 ثواني
  const successBanner = document.getElementById("successBanner");
  successBanner.classList.remove("d-none");
  successBanner.classList.add("show");

  // إخفاء البانر بعد 3 ثواني
  setTimeout(() => {
    successBanner.classList.remove("show");
    successBanner.classList.add("d-none");
  }, 3000);

  resultsDiv.classList.remove("d-none");

  document.getElementById("downloadBtn").addEventListener("click", () => {
    const extension = document.getElementById("fileExtension").value;
    downloadFile(uniqueContacts, extension);
  });
}

function downloadFile(uniqueContacts, extension) {
  let content = uniqueContacts.join("\n");
  let mimeType = "text/plain";

  if (extension === "csv") {
    content = uniqueContacts.join("\n");
    mimeType = "text/csv";
  }

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contacts_unique.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
