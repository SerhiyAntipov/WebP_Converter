const elements = {
  imageInput: document.getElementById("imageInput"),
  uploadTooltip: document.getElementById("uploadTooltip"),
  uploadButton: document.getElementById("uploadButton"),
  imageList: document.getElementById("imageList"),
  imageCount: document.getElementById("imageCount"),
  imageListStatus: document.getElementById("imageListStatus"),
  clearImagesButton: document.getElementById("clearImagesButton"),
  originalImage: document.getElementById("originalImage"),
  convertedImage: document.getElementById("convertedImage"),
  imageComparison: document.getElementById("imageComparison"),
  sampleImageNotice: document.getElementById("sampleImageNotice"),
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

const images = [];
const MAX_IMAGES = 10;
let activeImage = null;
let sampleImageEntry = null;
let conversionRequest = 0;
let sampleImageRequest = 0;

function clearResults() {
  elements.originalSize.textContent = "";
  elements.webpSize.textContent = "";
  elements.sizeChange.textContent = "";
  elements.sizeChange.classList.remove("sizeIncreased");
}

function revokeImageUrls() {
  images.forEach(({ originalUrl, convertedUrl }) => {
    URL.revokeObjectURL(originalUrl);
    if (convertedUrl) URL.revokeObjectURL(convertedUrl);
  });
  if (sampleImageEntry) {
    URL.revokeObjectURL(sampleImageEntry.originalUrl);
    if (sampleImageEntry.convertedUrl) URL.revokeObjectURL(sampleImageEntry.convertedUrl);
  }
}

function updateComparison() {
  const position = elements.comparisonSlider.value;
  elements.imageComparison.style.setProperty("--position", `${position}%`);
  elements.comparisonSlider.setAttribute(
    "aria-valuetext",
    `Divider at ${position}% of the image width`,
  );
}

function updateRangeTrack(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const value = Number(input.value);
  const progress = ((value - min) / (max - min)) * 100;
  input.style.setProperty("--range-progress", `${progress}%`);
}

function updateComparisonScale() {
  const imageWidth = elements.originalImage.naturalWidth;
  const imageHeight = elements.originalImage.naturalHeight;
  const comparisonRect = elements.imageComparison.getBoundingClientRect();

  if (!imageWidth || !imageHeight || !comparisonRect.width || !comparisonRect.height) {
    return;
  }

  const fitZoom = Math.min(
    (comparisonRect.width / imageWidth) * 100,
    (comparisonRect.height / imageHeight) * 100,
  );
  const scalePercent = Number(elements.comparisonScale.value);
  updateRangeTrack(elements.comparisonScale);
  elements.comparisonScaleValue.textContent = String(scalePercent);
  elements.imageComparison.style.setProperty("--zoom", String(scalePercent / fitZoom));
}

function setInitialComparisonScale() {
  const imageWidth = elements.originalImage.naturalWidth;
  const imageHeight = elements.originalImage.naturalHeight;
  const comparisonRect = elements.imageComparison.getBoundingClientRect();
  if (!imageWidth || !imageHeight || !comparisonRect.width || !comparisonRect.height) return;

  const fitZoom = Math.min(
    (comparisonRect.width / imageWidth) * 100,
    (comparisonRect.height / imageHeight) * 100,
  );
  const initialZoom = Math.max(0.1, Math.min(300, Math.round(fitZoom * 10) / 10));
  elements.comparisonScale.min = String(initialZoom);
  elements.comparisonScale.value = String(initialZoom);
  updateComparisonScale();
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
  elements.sizeChange.classList.toggle("sizeIncreased", savedPercent < 0);
}

function convertToWebp(imageUrl, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Could not load image for conversion."));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not create image canvas."));
        return;
      }

      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob || blob.type !== "image/webp") {
          reject(new Error("WebP conversion failed."));
          return;
        }
        resolve(blob);
      }, "image/webp", quality);
    };
    image.src = imageUrl;
  });
}

function convertImage() {
  if (!activeImage) return;

  const requestId = ++conversionRequest;
  const entry = activeImage;
  const quality = Number(elements.qualitySlider.value) / 100;

  convertToWebp(entry.originalUrl, quality).then((blob) => {
    if (requestId !== conversionRequest) return;

    if (entry.convertedUrl) URL.revokeObjectURL(entry.convertedUrl);
    entry.convertedUrl = URL.createObjectURL(blob);
    entry.convertedQuality = quality;
    elements.convertedImage.src = entry.convertedUrl;
    elements.downloadButton.href = entry.convertedUrl;
    elements.downloadButton.setAttribute("aria-disabled", String(images.length === 0));
    updateConversionResults(entry.file, blob);
  }).catch(() => {});
}

function updateDownloadButtonLabel() {
  elements.downloadButton.textContent = images.length > 1
    ? "Download all WebP"
    : "Download WebP";
}

function hideUploadTooltip() {
  elements.uploadTooltip.hidden = true;
}

function updateImageCount(message = "") {
  elements.imageCount.textContent = `${images.length} / ${MAX_IMAGES} max`;
  elements.imageListStatus.textContent = message;
  elements.imageListStatus.hidden = !message;
}

async function downloadAllImages() {
  const quality = Number(elements.qualitySlider.value) / 100;
  const converted = await Promise.all(images.map(async (entry) => {
    if (entry.convertedUrl && entry.convertedQuality === quality) {
      return { entry, url: entry.convertedUrl, temporary: false };
    }

    const blob = await convertToWebp(entry.originalUrl, quality);
    return { entry, url: URL.createObjectURL(blob), temporary: true };
  }));

  converted.forEach(({ entry, url, temporary }, index) => {
    window.setTimeout(() => {
      const link = document.createElement("a");
      const baseName = entry.file.name.replace(/\.[^.]+$/, "") || entry.file.name;
      link.href = url;
      link.download = `${baseName}.webp`;
      document.body.append(link);
      link.click();
      link.remove();
      if (temporary) window.setTimeout(() => URL.revokeObjectURL(url), 120000);
    }, index * 150);
  });
}

function renderImageList() {
  elements.imageList.replaceChildren();
  images.forEach((entry) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const deleteButton = document.createElement("button");
    const thumbnail = document.createElement("img");
    const name = document.createElement("span");
    button.type = "button";
    button.className = "imageThumbnail";
    button.setAttribute("aria-label", `Select ${entry.file.name}`);
    button.setAttribute("aria-pressed", String(entry === activeImage));
    thumbnail.src = entry.originalUrl;
    thumbnail.alt = "";
    name.textContent = entry.file.name;
    button.append(thumbnail, name);
    button.addEventListener("click", () => selectImage(entry));
    deleteButton.type = "button";
    deleteButton.className = "deleteImageButton";
    deleteButton.setAttribute("aria-label", `Delete ${entry.file.name}`);
    deleteButton.title = `Delete ${entry.file.name}`;
    deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" /></svg>';
    deleteButton.addEventListener("click", () => deleteImage(entry));
    item.append(button, deleteButton);
    elements.imageList.append(item);
  });
}

function deleteImage(entry) {
  const index = images.indexOf(entry);
  if (index < 0) return;

  const wasActive = activeImage === entry;
  URL.revokeObjectURL(entry.originalUrl);
  if (entry.convertedUrl) URL.revokeObjectURL(entry.convertedUrl);
  images.splice(index, 1);
  updateImageCount();
  updateDownloadButtonLabel();
  elements.clearImagesButton.disabled = images.length === 0;

  if (wasActive) {
    const nextImage = images[Math.min(index, images.length - 1)];
    if (nextImage) {
      selectImage(nextImage, true);
    } else {
      clearImages();
    }
    return;
  }

  renderImageList();
}

function selectImage(entry, focusSidebar = false) {
  activeImage = entry;
  elements.sampleImageNotice.hidden = entry === sampleImageEntry ? false : true;
  conversionRequest += 1;
  elements.originalImage.src = entry.originalUrl;
  elements.convertedImage.removeAttribute("src");
  elements.downloadButton.href = "#";
  elements.downloadButton.setAttribute("aria-disabled", "true");
  clearResults();
  elements.imageComparison.hidden = false;
  elements.originalImage.onload = setInitialComparisonScale;
  updateComparison();
  renderImageList();
  const activeThumbnail = elements.imageList.querySelector('[aria-pressed="true"]');
  activeThumbnail?.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (focusSidebar) {
    activeThumbnail?.focus({ preventScroll: true });
  }
  convertImage();
}

function loadImageFiles(files, focusFirst = false) {
  const availableSlots = MAX_IMAGES - images.length;
  const acceptedFiles = files.slice(0, availableSlots);
  if (!acceptedFiles.length) {
    updateImageCount(`Maximum of ${MAX_IMAGES} images reached. Remove an image before adding another.`);
    return;
  }

  const newEntries = acceptedFiles.map((file) => ({
    file,
    originalUrl: URL.createObjectURL(file),
    convertedUrl: null,
  }));
  const activeIndex = images.indexOf(activeImage);
  const insertionIndex = activeIndex < 0 ? 0 : activeIndex + 1;
  images.splice(insertionIndex, 0, ...newEntries);
  const message = acceptedFiles.length < files.length
    ? `Added ${acceptedFiles.length}. Maximum is ${MAX_IMAGES}; remove images to add more.`
    : images.length === MAX_IMAGES
      ? `Maximum of ${MAX_IMAGES} images reached.`
      : "";
  updateImageCount(message);
  updateDownloadButtonLabel();
  elements.clearImagesButton.disabled = images.length === 0;
  if (newEntries.length) selectImage(newEntries[0], focusFirst);
}

function clearImages() {
  conversionRequest += 1;
  images.forEach(({ originalUrl, convertedUrl }) => {
    URL.revokeObjectURL(originalUrl);
    if (convertedUrl) URL.revokeObjectURL(convertedUrl);
  });
  images.length = 0;
  updateImageCount();
  activeImage = null;
  updateDownloadButtonLabel();
  elements.imageList.replaceChildren();
  elements.originalImage.removeAttribute("src");
  elements.convertedImage.removeAttribute("src");
  elements.imageComparison.hidden = true;
  elements.downloadButton.href = "#";
  elements.downloadButton.setAttribute("aria-disabled", "true");
  clearResults();
  elements.comparisonScale.value = "100";
  elements.comparisonScaleValue.textContent = "100";
  elements.imageComparison.style.setProperty("--zoom", "1");
  elements.clearImagesButton.disabled = true;

  if (sampleImageEntry) {
    selectImage(sampleImageEntry);
  } else {
    loadSampleImage();
  }
}

async function loadSampleImage() {
  const requestId = ++sampleImageRequest;
  const samplePath = sampleImagePaths[Math.floor(Math.random() * sampleImagePaths.length)];

  try {
    const response = await fetch(samplePath);
    if (!response.ok) throw new Error("Sample image request failed.");
    const blob = await response.blob();
    if (requestId !== sampleImageRequest || images.length) return;

    const fileName = decodeURIComponent(new URL(samplePath, document.baseURI).pathname.split("/").pop());
    const extension = fileName.split(".").pop().toLowerCase();
    const fileType = blob.type || `image/${extension === "jpg" ? "jpeg" : extension}`;
    const file = new File([blob], fileName, { type: fileType });
    sampleImageEntry = {
      file,
      originalUrl: URL.createObjectURL(file),
      convertedUrl: null,
    };
    selectImage(sampleImageEntry);
  } catch {
    // The sample is optional; users can still choose images.
  }
}

elements.imageInput.addEventListener("change", () => {
  const files = Array.from(elements.imageInput.files);
  if (!files.length) return;

  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) return;

  sampleImageRequest += 1;
  loadImageFiles(imageFiles, true);
  elements.imageInput.value = "";
});

elements.clearImagesButton.addEventListener("click", clearImages);
elements.uploadButton.addEventListener("click", hideUploadTooltip);

elements.comparisonSlider.addEventListener("input", updateComparison);
elements.comparisonScale.addEventListener("input", updateComparisonScale);
elements.downloadButton.addEventListener("click", (event) => {
  if (elements.downloadButton.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
    return;
  }
  if (images.length > 1) {
    event.preventDefault();
    downloadAllImages().catch(() => {});
  }
});
elements.qualitySlider.addEventListener("input", () => {
  elements.qualityValue.textContent = elements.qualitySlider.value;
  updateRangeTrack(elements.qualitySlider);
  convertImage();
});

new ResizeObserver(updateComparisonScale).observe(elements.imageComparison);
window.addEventListener("beforeunload", revokeImageUrls);

updateRangeTrack(elements.qualitySlider);
elements.uploadTooltip.hidden = false;
window.setTimeout(hideUploadTooltip, 3000);
loadSampleImage();

