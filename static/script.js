const elements = {
  imageInput: document.getElementById("imageInput"),
  originalImage: document.getElementById("originalImage"),
  convertedImage: document.getElementById("convertedImage"),
  imageComparison: document.getElementById("imageComparison"),
  comparisonSlider: document.getElementById("comparisonSlider"),
  qualitySlider: document.getElementById("qualitySlider"),
  qualityValue: document.getElementById("qualityValue"),
  qualityControl: document.querySelector(".qualityControl"),
  downloadLink: document.getElementById("downloadLink"),
  originalSize: document.getElementById("originalSize"),
  webpSize: document.getElementById("webpSize"),
  sizeChange: document.getElementById("sizeChange"),
};

const sampleImagePaths = [
  "./images/img_01.jpg",
  "./images/img_02.jpg",
  "./images/img_03.jpg",
  "./images/img_04.jpg",
  "./images/img_05.jpg",
];

let originalImageUrl = null;
let convertedImageUrl = null;
let selectedImage = null;
let conversionRequest = 0;
let sampleImageRequest = 0;

function clearResults() {
  elements.originalSize.textContent = "";
  elements.webpSize.textContent = "";
  elements.sizeChange.textContent = "";
}

function revokeImageUrls() {
  if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
  if (convertedImageUrl) URL.revokeObjectURL(convertedImageUrl);
  originalImageUrl = null;
  convertedImageUrl = null;
}

function updateComparison() {
  const position = elements.comparisonSlider.value;
  elements.imageComparison.style.setProperty("--position", `${position}%`);
  elements.comparisonSlider.setAttribute(
    "aria-valuetext",
    `Divider at ${position}% of the image width`,
  );
}

function syncQualityWidth() {
  elements.qualityControl.style.width = `${elements.imageComparison.getBoundingClientRect().width}px`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileFormat(file) {
  if (file.type === "image/jpeg") return "JPG";
  const extension = file.name.split(".").pop();
  return extension && extension !== file.name
    ? extension.toUpperCase()
    : "Original";
}

function updateConversionResults(sourceFile, webpBlob) {
  const savedPercent = ((sourceFile.size - webpBlob.size) / sourceFile.size) * 100;
  const sizeChange =
    savedPercent >= 0
      ? `Saved: ${savedPercent.toFixed(1)}%.`
      : `File size increased by ${Math.abs(savedPercent).toFixed(1)}%.`;

  elements.originalSize.textContent =
    `Original ${getFileFormat(sourceFile)} size: ${formatFileSize(sourceFile.size)}.`;
  elements.webpSize.textContent = `WebP size: ${formatFileSize(webpBlob.size)}.`;
  elements.sizeChange.textContent = sizeChange;
}

function convertImage() {
  if (!selectedImage || !originalImageUrl) return;

  const requestId = ++conversionRequest;
  const sourceFile = selectedImage;
  const image = new Image();

  image.onload = () => {
    if (requestId !== conversionRequest) return;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(image, 0, 0);
    canvas.toBlob((blob) => {
      if (requestId !== conversionRequest || !blob || blob.type !== "image/webp") {
        return;
      }

      if (convertedImageUrl) URL.revokeObjectURL(convertedImageUrl);
      convertedImageUrl = URL.createObjectURL(blob);
      elements.convertedImage.src = convertedImageUrl;
      elements.downloadLink.href = convertedImageUrl;
      elements.downloadLink.hidden = false;
      updateConversionResults(sourceFile, blob);
    }, "image/webp", Number(elements.qualitySlider.value) / 100);
  };

  image.src = originalImageUrl;
}

function loadImageFile(file) {
  revokeImageUrls();
  conversionRequest += 1;
  originalImageUrl = URL.createObjectURL(file);
  selectedImage = file;

  elements.convertedImage.removeAttribute("src");
  elements.downloadLink.hidden = true;
  clearResults();
  elements.imageComparison.hidden = false;

  elements.originalImage.onload = () => {
    elements.imageComparison.style.aspectRatio =
      `${elements.originalImage.naturalWidth} / ${elements.originalImage.naturalHeight}`;
    syncQualityWidth();
  };
  elements.originalImage.src = originalImageUrl;

  updateComparison();
  convertImage();
}

async function loadSampleImage() {
  const requestId = ++sampleImageRequest;
  const samplePath = sampleImagePaths[
    Math.floor(Math.random() * sampleImagePaths.length)
  ];

  try {
    const response = await fetch(samplePath);
    if (!response.ok) throw new Error("Sample image request failed.");

    const blob = await response.blob();
    if (requestId !== sampleImageRequest) return;

    const fileName = decodeURIComponent(
      new URL(samplePath, document.baseURI).pathname.split("/").pop(),
    );
    const extension = fileName.split(".").pop().toLowerCase();
    const fileType = blob.type || `image/${extension === "jpg" ? "jpeg" : extension}`;
    loadImageFile(new File([blob], fileName, { type: fileType }));
  } catch {
    // Sample images are optional; users can still choose a file.
  }
}

elements.imageInput.addEventListener("change", () => {
  const [file] = elements.imageInput.files;
  if (!file) return;

  sampleImageRequest += 1;
  if (!file.type.startsWith("image/")) {
    elements.imageInput.value = "";
    return;
  }

  loadImageFile(file);
});

elements.comparisonSlider.addEventListener("input", updateComparison);
elements.qualitySlider.addEventListener("input", () => {
  elements.qualityValue.textContent = elements.qualitySlider.value;
  convertImage();
});

new ResizeObserver(syncQualityWidth).observe(elements.imageComparison);
window.addEventListener("beforeunload", revokeImageUrls);

loadSampleImage();
