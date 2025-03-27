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

  if (!file.name.endsWith(".vcf")) {
    alert("يرجى رفع ملف بصيغة VCF!");
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

    // تحليل ملف VCF
    const contacts = parseVCF(text);
    if (contacts.length === 0) {
      alert("لم يتم العثور على جهات اتصال في الملف!");
      progressContainer.classList.add("d-none");
      return;
    }

    allContacts = contacts;
    processContactsWithWorker(contacts);
  };
  reader.readAsArrayBuffer(file);
}

// دالة لتحليل ملف VCF
function parseVCF(text) {
  const contacts = [];
  const vCards = text.split("BEGIN:VCARD").slice(1);

  vCards.forEach((vCard) => {
    const lines = vCard.split(/\r?\n/);
    let name = "";
    let number = "";

    lines.forEach((line) => {
      if (line.startsWith("FN:")) {
        name = line.replace("FN:", "").trim();
      }
      if (line.startsWith("TEL")) {
        number = line.split(":")[1]?.trim().replace(/\s|-/g, "");
      }
    });

    if (name && number) {
      contacts.push({ name, number });
    }
  });

  return contacts;
}

function processContactsWithWorker(contacts) {
  const progressBar = document.getElementById("progressBar");

  const worker = new Worker(
    URL.createObjectURL(
      new Blob(
        [
          `
        onmessage = function(e) {
            const contacts = e.data;

            // تكرارات الأسماء
            const nameMap = new Map();
            const duplicateNames = [];
            contacts.forEach(contact => {
                const name = contact.name;
                if (nameMap.has(name)) {
                    nameMap.set(name, nameMap.get(name) + 1);
                    if (nameMap.get(name) === 2) duplicateNames.push(name);
                } else {
                    nameMap.set(name, 1);
                }
            });

            // تكرارات الأرقام
            const numberMap = new Map();
            const duplicateNumbers = [];
            contacts.forEach(contact => {
                const number = contact.number;
                if (numberMap.has(number)) {
                    numberMap.set(number, numberMap.get(number) + 1);
                    if (numberMap.get(number) === 2) duplicateNumbers.push(number);
                } else {
                    numberMap.set(number, 1);
                }
            });

            const uniqueNumbers = [...numberMap.keys()];
            postMessage({ duplicateNames, duplicateNumbers, uniqueNumbers, progress: 100 });
        };
    `,
        ],
        { type: "application/javascript" }
      )
    )
  );

  worker.onmessage = function (e) {
    const { progress, duplicateNames, duplicateNumbers, uniqueNumbers } =
      e.data;
    progressBar.style.width = `${progress}%`;
    progressBar.setAttribute("aria-valuenow", progress);

    if (progress === 100) {
      uniqueContacts = uniqueNumbers;
      document.getElementById("progressContainer").classList.add("d-none");
      displayDuplicates(duplicateNames, duplicateNumbers);
    }
  };

  worker.postMessage(contacts);
}

function displayDuplicates(duplicateNames, duplicateNumbers) {
  const duplicatesDiv = document.getElementById("duplicates");
  const duplicateNameCountSpan = document.getElementById("duplicateNameCount");
  const duplicateNameListDiv = document.getElementById("duplicateNameList");
  const duplicateNumberCountSpan = document.getElementById(
    "duplicateNumberCount"
  );
  const duplicateNumberListDiv = document.getElementById("duplicateNumberList");

  // عرض تكرارات الأسماء
  duplicateNameCountSpan.textContent = duplicateNames.length;
  duplicateNameListDiv.innerHTML = duplicateNames
    .map((name) => `<p>${name}</p>`)
    .join("");

  // عرض تكرارات الأرقام
  duplicateNumberCountSpan.textContent = duplicateNumbers.length;
  duplicateNumberListDiv.innerHTML = duplicateNumbers
    .map((number) => `<p>${number}</p>`)
    .join("");

  duplicatesDiv.classList.remove("d-none");

  // زر دمج بناءً على الأرقام
  document.getElementById("mergeByNumbersBtn").addEventListener("click", () => {
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

  const successBanner = document.getElementById("successBanner");
  successBanner.classList.remove("d-none");
  successBanner.classList.add("show");

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
  let content;
  let mimeType;

  if (extension === "vcf") {
    // إنشاء ملف VCF
    content = uniqueContacts
      .map((number, index) => {
        return `BEGIN:VCARD\nVERSION:3.0\nFN:Contact ${
          index + 1
        }\nTEL:${number}\nEND:VCARD`;
      })
      .join("\n");
    mimeType = "text/vcard";
  } else if (extension === "csv") {
    content = uniqueContacts.join("\n");
    mimeType = "text/csv";
  } else {
    content = uniqueContacts.join("\n");
    mimeType = "text/plain";
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
