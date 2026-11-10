const elements = {
  imageInput: document.getElementById("imageInput"),
  originalImage: document.getElementById("originalImage"),
  convertedImage: document.getElementById("convertedImage"),
  imageComparison: document.getElementById("imageComparison"),
  comparisonSlider: document.getElementById("comparisonSlider"),
  comparisonScale: document.getElementById("comparisonScale"),
  comparisonScaleValue: document.getElementById("comparisonScaleValue"),
  qualitySlider: document.getElementById("qualitySlider"),
  qualityValue: document.getElementById("qualityValue"),
  downloadButton: document.getElementById("downloadButton"),
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

function updateComparisonScale() {
  const imageWidth = elements.originalImage.naturalWidth;
  const imageHeight = elements.originalImage.naturalHeight;
  const comparisonRect = elements.imageComparison.getBoundingClientRect();

  if (!imageWidth || !imageHeight || !comparisonRect.width || !comparisonRect.height) {
    return;
  }

  const widthScale = comparisonRect.width / imageWidth;
  const heightScale = comparisonRect.height / imageHeight;
  const coverScale = Math.max(widthScale, heightScale);
  const containScale = Math.min(widthScale, heightScale);
  const minimumPercent = Math.ceil((containScale / coverScale) * 100);

  elements.comparisonScale.min = String(minimumPercent);
  if (Number(elements.comparisonScale.value) < minimumPercent) {
    elements.comparisonScale.value = String(minimumPercent);
  }

  const scalePercent = Number(elements.comparisonScale.value);
  elements.comparisonScaleValue.textContent = String(scalePercent);
  const zoom = (coverScale / containScale) * (scalePercent / 100);
  elements.imageComparison.style.setProperty("--zoom", String(zoom));
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
  elements.originalSize.textContent = `Original ${getFileFormat(sourceFile)}: ${formatFileSize(sourceFile.size)}.`;
  elements.webpSize.textContent = `Converted WebP: ${formatFileSize(webpBlob.size)}.`;

  const savedPercent = ((sourceFile.size - webpBlob.size) / sourceFile.size) * 100;
  const sizeChange = savedPercent >= 0
    ? `Size reduction: ${savedPercent.toFixed(1)}%.`
    : `Size increased ${Math.abs(savedPercent).toFixed(1)}%.`;

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
      elements.downloadButton.href = convertedImageUrl;
      elements.downloadButton.setAttribute("aria-disabled", "false");
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
  elements.downloadButton.href = "#";
  elements.downloadButton.setAttribute("aria-disabled", "true");
  clearResults();
  elements.imageComparison.hidden = false;

  elements.originalImage.onload = () => {
    updateComparisonScale();
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
elements.comparisonScale.addEventListener("input", updateComparisonScale);
elements.downloadButton.addEventListener("click", (event) => {
  if (elements.downloadButton.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
  }
});
elements.qualitySlider.addEventListener("input", () => {
  elements.qualityValue.textContent = elements.qualitySlider.value;
  convertImage();
});

new ResizeObserver(updateComparisonScale).observe(elements.imageComparison);
window.addEventListener("beforeunload", revokeImageUrls);

loadSampleImage();
