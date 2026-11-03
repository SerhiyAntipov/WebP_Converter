const fileInput = document.getElementById("fileInput");
const beforeImage = document.getElementById("beforeImage");
const afterImage = document.getElementById("afterImage");
const comparison = document.getElementById("comparison");
const comparisonSlider = document.getElementById("comparisonSlider");

const quality = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");

const statusElement = document.getElementById("status");
const downloadLink = document.getElementById("downloadLink");
let currentImageUrl = null;
let currentWebpUrl = null;
let selectedImage = null;
let conversionRequest = 0;

function convertImage() {
  if (!selectedImage) return;

  const requestId = ++conversionRequest;
  const imageUrl = currentImageUrl;
  const sourceFile = selectedImage;
  const requestedQuality = Number(quality.value) / 100;
  const image = new Image();
  
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);

    canvas.toBlob((blob) => {
      if (requestId !== conversionRequest) return;

      if (!blob || blob.type !== "image/webp") {
        statusElement.textContent = "Could not create a WebP image in this browser.";
        downloadLink.hidden = true;
        return;
      }

      if (currentWebpUrl) URL.revokeObjectURL(currentWebpUrl);
      currentWebpUrl = URL.createObjectURL(blob);
      afterImage.src = currentWebpUrl;
      downloadLink.href = currentWebpUrl;
      downloadLink.hidden = false;
      const outputSize = formatFileSize(blob.size);
      const originalSize = formatFileSize(sourceFile.size);
      const originalFormat = getFileFormat(sourceFile);
      const savings = ((sourceFile.size - blob.size) / sourceFile.size) * 100;
      const sizeChange = savings >= 0
        ? `Saved ${savings.toFixed(1)}%.`
        : `File size increased by ${Math.abs(savings).toFixed(1)}%.`;
      statusElement.textContent = `Original ${originalFormat} size: ${originalSize}.\nWebP size: ${outputSize}.\n${sizeChange}`;
    }, "image/webp", requestedQuality);
  };
  image.onerror = () => {
    if (requestId !== conversionRequest) return;
    statusElement.textContent = "Could not load this image.";
  };
  image.src = imageUrl;
}

function updateComparison() {
  const position = comparisonSlider.value;
  comparison.style.setProperty("--position", `${position}%`);
  comparisonSlider.setAttribute("aria-valuetext", `Divider at ${position}% of the image width`);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileFormat(file) {
  if (file.type === "image/jpeg") return "JPG";

  const extension = file.name.split(".").pop();
  return extension && extension !== file.name ? extension.toUpperCase() : "Original";
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    fileInput.value = "";
    statusElement.textContent = "Please choose an image file.";
    return;
  }

  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
  if (currentWebpUrl) URL.revokeObjectURL(currentWebpUrl);
  conversionRequest += 1;
  currentImageUrl = URL.createObjectURL(file);
  currentWebpUrl = null;
  afterImage.removeAttribute("src");
  selectedImage = file;
  downloadLink.hidden = true;
  statusElement.textContent = "Converting image…";
  beforeImage.src = currentImageUrl;
  comparison.hidden = false;
  beforeImage.onload = () => {
    comparison.style.aspectRatio = `${beforeImage.naturalWidth} / ${beforeImage.naturalHeight}`;
  };
  updateComparison();
  convertImage();
});

comparisonSlider.addEventListener("input", updateComparison);

quality.addEventListener("input", () => {
  qualityValue.textContent = quality.value;
  if (selectedImage) {
    statusElement.textContent = "Converting image…";
    downloadLink.hidden = true;
    convertImage();
  }
});

window.addEventListener("beforeunload", () => {
  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
  if (currentWebpUrl) URL.revokeObjectURL(currentWebpUrl);
});
