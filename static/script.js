// Page elements used by the converter.
const elements = {
  fileInput: document.getElementById("imageInput"),
  uploadButton: document.getElementById("uploadButton"),
  uploadTooltip: document.getElementById("uploadTooltip"),
  imageList: document.getElementById("imageList"),
  imageCount: document.getElementById("imageCount"),
  imageListStatus: document.getElementById("imageListStatus"),
  clearImagesButton: document.getElementById("clearImagesButton"),
  originalImage: document.getElementById("originalImage"),
  convertedImage: document.getElementById("convertedImage"),
  imageComparison: document.getElementById("imageComparison"),
  sampleImageNotice: document.getElementById("sampleImageNotice"),
  comparisonSlider: document.getElementById("comparisonSlider"),
  zoomSlider: document.getElementById("comparisonScale"),
  zoomValue: document.getElementById("comparisonScaleValue"),
  qualitySlider: document.getElementById("qualitySlider"),
  qualityValue: document.getElementById("qualityValue"),
  downloadButton: document.getElementById("downloadButton"),
  originalSize: document.getElementById("originalSize"),
  webpSize: document.getElementById("webpSize"),
  sizeChange: document.getElementById("sizeChange"),
};

const MAX_IMAGES = 10;
const QUALITY_UPDATE_DELAY = 140;
const BATCH_DOWNLOAD_DELAY = 150;
const TEMP_URL_LIFETIME = 120000;

const sampleImagePaths = [
  "./images/img_01.jpg",
  "./images/img_02.jpg",
  "./images/img_03.jpg",
  "./images/img_04.jpg",
  "./images/img_05.jpg",
];

// The sample is shown in the comparison but is never added to the user's list.
const state = {
  images: [],
  activeImage: null,
  sampleImage: null,
  conversionId: 0,
  sampleRequestId: 0,
  qualityTimer: null,
  imageListStatusTimer: null,
};

// -----------------------------------------------------------------------------
// Formatting and small UI updates
// -----------------------------------------------------------------------------

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

function clearConversionInfo() {
  elements.originalSize.textContent = "";
  elements.webpSize.textContent = "";
  elements.sizeChange.textContent = "";
  elements.sizeChange.classList.remove("sizeIncreased");
}

function updateImageCount(message = "") {
  window.clearTimeout(state.imageListStatusTimer);
  elements.imageCount.textContent = `${state.images.length} / ${MAX_IMAGES} max`;
  elements.imageListStatus.textContent = message;
  elements.imageListStatus.hidden = !message;

  if (message) {
    state.imageListStatusTimer = window.setTimeout(() => {
      elements.imageListStatus.hidden = true;
      state.imageListStatusTimer = null;
    }, 3000);
  }
}

function updateDownloadButton() {
  elements.downloadButton.textContent =
    state.images.length > 1 ? "Download all WebP" : "Download WebP";
}

function hideUploadTooltip() {
  elements.uploadTooltip.hidden = true;
}

function updateRangeFill(slider) {
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 100;
  const value = Number(slider.value);
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;

  slider.style.setProperty("--range-progress", `${Math.round(progress)}%`);
}

function updateComparisonPosition() {
  const position = elements.comparisonSlider.value;

  elements.imageComparison.style.setProperty("--position", `${position}%`);
  elements.comparisonSlider.setAttribute(
    "aria-valuetext",
    `Divider at ${position}% of the image width`,
  );
}

// -----------------------------------------------------------------------------
// Zoom controls
// -----------------------------------------------------------------------------

function getImageZoomRange() {
  const imageWidth = elements.originalImage.naturalWidth;
  const imageHeight = elements.originalImage.naturalHeight;
  const comparisonWidth = elements.imageComparison.clientWidth;
  const comparisonHeight = elements.imageComparison.clientHeight;

  if (!imageWidth || !imageHeight || !comparisonWidth || !comparisonHeight) {
    return null;
  }

  const widthZoom = (comparisonWidth / imageWidth) * 100;
  const heightZoom = (comparisonHeight / imageHeight) * 100;
  return {
    contain: Math.min(widthZoom, heightZoom),
    cover: Math.max(widthZoom, heightZoom),
  };
}

function updateZoom() {
  const zoomRange = getImageZoomRange();
  if (!zoomRange) return;

  const zoomPercent = Number(elements.zoomSlider.value);
  const imageScale = zoomPercent / zoomRange.contain;

  elements.zoomValue.textContent = String(Math.round(zoomPercent));
  elements.imageComparison.style.setProperty("--zoom", String(imageScale));
  updateRangeFill(elements.zoomSlider);
}

function setStartingZoom() {
  const zoomRange = getImageZoomRange();
  if (!zoomRange) return;

  // Start at cover zoom, while allowing the user to zoom out to contain.
  const minimumZoom = Math.max(0.1, Math.round(zoomRange.contain * 10) / 10);
  const startingZoom = Math.max(
    minimumZoom,
    Math.round(zoomRange.cover * 10) / 10,
  );
  const maximumZoom = Math.max(300, Math.ceil(startingZoom * 3));

  elements.zoomSlider.min = String(minimumZoom);
  elements.zoomSlider.max = String(maximumZoom);
  elements.zoomSlider.value = String(startingZoom);
  updateZoom();
}

// -----------------------------------------------------------------------------
// Image conversion
// -----------------------------------------------------------------------------

function convertImageToWebP(imageUrl, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onerror = () => reject(new Error("The image could not be loaded."));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("The browser could not create a canvas."));
        return;
      }

      context.drawImage(image, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.type !== "image/webp") {
            reject(new Error("The browser could not create a WebP image."));
            return;
          }

          resolve(blob);
        },
        "image/webp",
        quality,
      );
    };

    image.src = imageUrl;
  });
}

function showConversionInfo(sourceFile, webpBlob) {
  elements.originalSize.textContent = `Original ${getFileFormat(sourceFile)}: ${formatFileSize(sourceFile.size)}.`;
  elements.webpSize.textContent = `Converted WebP: ${formatFileSize(webpBlob.size)}.`;

  const savedPercent =
    ((sourceFile.size - webpBlob.size) / sourceFile.size) * 100;
  const sizeIncreased = savedPercent < 0;

  elements.sizeChange.textContent = sizeIncreased
    ? `Size increased ${Math.abs(savedPercent).toFixed(1)}%.`
    : `Size reduction: ${savedPercent.toFixed(1)}%.`;
  elements.sizeChange.classList.toggle("sizeIncreased", sizeIncreased);
}

async function convertActiveImage() {
  if (!state.activeImage) return;

  const conversionId = ++state.conversionId;
  const imageEntry = state.activeImage;
  const quality = Number(elements.qualitySlider.value) / 100;

  try {
    const webpBlob = await convertImageToWebP(imageEntry.originalUrl, quality);

    // Ignore older work if the user has since selected another image or quality.
    if (conversionId !== state.conversionId) return;

    if (imageEntry.convertedUrl) {
      URL.revokeObjectURL(imageEntry.convertedUrl);
    }

    imageEntry.convertedUrl = URL.createObjectURL(webpBlob);
    imageEntry.convertedQuality = quality;
    elements.convertedImage.src = imageEntry.convertedUrl;
    elements.downloadButton.href = imageEntry.convertedUrl;
    elements.downloadButton.setAttribute(
      "aria-disabled",
      String(state.images.length === 0),
    );
    showConversionInfo(imageEntry.file, webpBlob);
  } catch {
    // A failed conversion leaves the download disabled; the user can try again.
  }
}

function getWebPFileName(fileName) {
  const nameWithoutExtension = fileName.replace(/\.[^.]+$/, "");
  return `${nameWithoutExtension || fileName}.webp`;
}

async function downloadAllImages() {
  const quality = Number(elements.qualitySlider.value) / 100;
  const filesToDownload = [];

  // Convert one file at a time so large images do not create many canvases at once.
  for (const imageEntry of state.images) {
    if (imageEntry.convertedUrl && imageEntry.convertedQuality === quality) {
      filesToDownload.push({
        fileName: getWebPFileName(imageEntry.file.name),
        url: imageEntry.convertedUrl,
        temporaryUrl: false,
      });
      continue;
    }

    const webpBlob = await convertImageToWebP(imageEntry.originalUrl, quality);
    filesToDownload.push({
      fileName: getWebPFileName(imageEntry.file.name),
      url: URL.createObjectURL(webpBlob),
      temporaryUrl: true,
    });
  }

  filesToDownload.forEach((file, index) => {
    window.setTimeout(() => {
      const downloadLink = document.createElement("a");
      downloadLink.href = file.url;
      downloadLink.download = file.fileName;
      document.body.append(downloadLink);
      downloadLink.click();
      downloadLink.remove();

      if (file.temporaryUrl) {
        window.setTimeout(
          () => URL.revokeObjectURL(file.url),
          TEMP_URL_LIFETIME,
        );
      }
    }, index * BATCH_DOWNLOAD_DELAY);
  });
}

// -----------------------------------------------------------------------------
// Image list and selection
// -----------------------------------------------------------------------------

function releaseImage(imageEntry) {
  if (imageEntry.originalUrl) URL.revokeObjectURL(imageEntry.originalUrl);
  if (imageEntry.convertedUrl) URL.revokeObjectURL(imageEntry.convertedUrl);

  imageEntry.originalUrl = null;
  imageEntry.convertedUrl = null;
}

function releaseAllImageUrls() {
  const allImages = [...state.images];
  if (state.sampleImage) allImages.push(state.sampleImage);
  allImages.forEach(releaseImage);
}

function createDeleteIcon() {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNamespace, "svg");
  const path = document.createElementNS(svgNamespace, "path");

  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  path.setAttribute("d", "M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3");
  svg.append(path);

  return svg;
}

function renderImageList() {
  elements.imageList.replaceChildren();

  state.images.forEach((imageEntry) => {
    const listItem = document.createElement("li");
    const selectButton = document.createElement("button");
    const thumbnail = document.createElement("img");
    const fileName = document.createElement("span");
    const deleteButton = document.createElement("button");

    selectButton.type = "button";
    selectButton.className = "imageThumbnail";
    selectButton.setAttribute("aria-label", `Select ${imageEntry.file.name}`);
    selectButton.setAttribute(
      "aria-pressed",
      String(imageEntry === state.activeImage),
    );

    thumbnail.src = imageEntry.originalUrl;
    thumbnail.alt = "";
    thumbnail.loading = "lazy";
    thumbnail.decoding = "async";
    fileName.textContent = imageEntry.file.name;
    selectButton.append(thumbnail, fileName);
    selectButton.addEventListener("click", () => selectImage(imageEntry));

    deleteButton.type = "button";
    deleteButton.className = "deleteImageButton";
    deleteButton.setAttribute("aria-label", `Delete ${imageEntry.file.name}`);
    deleteButton.title = `Delete ${imageEntry.file.name}`;
    deleteButton.append(createDeleteIcon());
    deleteButton.addEventListener("click", () => deleteImage(imageEntry));

    listItem.append(selectButton, deleteButton);
    elements.imageList.append(listItem);
  });
}

function selectImage(imageEntry, moveFocusToList = false) {
  if (imageEntry === state.activeImage) return;

  window.clearTimeout(state.qualityTimer);
  state.qualityTimer = null;
  state.activeImage = imageEntry;
  state.conversionId += 1;

  elements.sampleImageNotice.hidden = imageEntry !== state.sampleImage;
  elements.originalImage.src = imageEntry.originalUrl;
  elements.convertedImage.removeAttribute("src");
  elements.downloadButton.href = "#";
  elements.downloadButton.setAttribute("aria-disabled", "true");
  elements.imageComparison.hidden = false;
  elements.originalImage.onload = setStartingZoom;
  clearConversionInfo();
  renderImageList();
  updateComparisonPosition();

  const selectedThumbnail = elements.imageList.querySelector(
    '[aria-pressed="true"]',
  );
  selectedThumbnail?.scrollIntoView({ block: "nearest", inline: "nearest" });

  if (moveFocusToList) {
    selectedThumbnail?.focus({ preventScroll: true });
  }

  convertActiveImage();
}

function updateImageListAfterChange(message = "") {
  updateImageCount(message);
  updateDownloadButton();
  elements.clearImagesButton.disabled = state.images.length === 0;
}

function loadImageFiles(files, moveFocusToList = false) {
  const availableSlots = MAX_IMAGES - state.images.length;
  const acceptedFiles = files.slice(0, availableSlots);

  if (acceptedFiles.length === 0) {
    updateImageCount(
      `Maximum of ${MAX_IMAGES} images reached. Remove an image before adding another.`,
    );
    return;
  }

  const newImages = acceptedFiles.map((file) => ({
    file,
    originalUrl: URL.createObjectURL(file),
    convertedUrl: null,
    convertedQuality: null,
  }));

  // Add new files after the active user image. The sample is not in this list.
  const activeIndex = state.images.indexOf(state.activeImage);
  const insertAt = activeIndex < 0 ? 0 : activeIndex + 1;
  state.images.splice(insertAt, 0, ...newImages);

  let message = "";
  if (acceptedFiles.length < files.length) {
    message = `Added ${acceptedFiles.length}. Maximum is ${MAX_IMAGES}; remove images to add more.`;
  } else if (state.images.length === MAX_IMAGES) {
    message = `Maximum of ${MAX_IMAGES} images reached.`;
  }

  updateImageListAfterChange(message);
  selectImage(newImages[0], moveFocusToList);
}

function deleteImage(imageEntry) {
  const imageIndex = state.images.indexOf(imageEntry);
  if (imageIndex === -1) return;

  const wasActiveImage = state.activeImage === imageEntry;
  releaseImage(imageEntry);
  state.images.splice(imageIndex, 1);
  updateImageListAfterChange();

  if (!wasActiveImage) {
    renderImageList();
    return;
  }

  const nextIndex = Math.min(imageIndex, state.images.length - 1);
  const nextImage = state.images[nextIndex];

  if (nextImage) {
    selectImage(nextImage, true);
  } else {
    clearAllImages();
  }
}

function clearAllImages() {
  window.clearTimeout(state.qualityTimer);
  state.qualityTimer = null;
  state.conversionId += 1;

  state.images.forEach(releaseImage);
  state.images.length = 0;
  state.activeImage = null;

  updateImageListAfterChange();
  elements.imageList.replaceChildren();
  elements.originalImage.removeAttribute("src");
  elements.convertedImage.removeAttribute("src");
  elements.imageComparison.hidden = true;
  elements.downloadButton.href = "#";
  elements.downloadButton.setAttribute("aria-disabled", "true");
  elements.zoomSlider.min = "0.1";
  elements.zoomSlider.max = "300";
  elements.zoomSlider.value = "100";
  elements.zoomValue.textContent = "100";
  elements.imageComparison.style.setProperty("--zoom", "1");
  clearConversionInfo();

  // Return to the sample so the comparison area never stays empty.
  if (state.sampleImage) {
    selectImage(state.sampleImage);
  } else {
    loadSampleImage();
  }
}

async function loadSampleImage() {
  const requestId = ++state.sampleRequestId;
  const samplePath =
    sampleImagePaths[Math.floor(Math.random() * sampleImagePaths.length)];

  try {
    const response = await fetch(samplePath);
    if (!response.ok) throw new Error("The sample image could not be loaded.");

    const blob = await response.blob();
    if (requestId !== state.sampleRequestId || state.images.length > 0) return;

    const fileName = decodeURIComponent(
      new URL(samplePath, document.baseURI).pathname.split("/").pop(),
    );
    const extension = fileName.split(".").pop().toLowerCase();
    const fileType =
      blob.type || `image/${extension === "jpg" ? "jpeg" : extension}`;
    const file = new File([blob], fileName, { type: fileType });

    state.sampleImage = {
      file,
      originalUrl: URL.createObjectURL(file),
      convertedUrl: null,
      convertedQuality: null,
    };

    selectImage(state.sampleImage);
  } catch {
    // The sample is optional. Users can still choose their own images.
  }
}

// -----------------------------------------------------------------------------
// Event handlers and startup
// -----------------------------------------------------------------------------

elements.fileInput.addEventListener("change", () => {
  const selectedFiles = Array.from(elements.fileInput.files);
  const imageFiles = selectedFiles.filter((file) =>
    file.type.startsWith("image/"),
  );

  if (imageFiles.length > 0) {
    state.sampleRequestId += 1;
    loadImageFiles(imageFiles, true);
  }

  // Clearing the input lets the user select the same file again later.
  elements.fileInput.value = "";
});

elements.uploadButton.addEventListener("click", hideUploadTooltip);
elements.clearImagesButton.addEventListener("click", clearAllImages);
elements.comparisonSlider.addEventListener("input", updateComparisonPosition);
elements.zoomSlider.addEventListener("input", updateZoom);

elements.qualitySlider.addEventListener("input", () => {
  elements.qualityValue.textContent = elements.qualitySlider.value;
  updateRangeFill(elements.qualitySlider);

  // Ignore any conversion started with the previous quality value.
  state.conversionId += 1;
  elements.downloadButton.setAttribute("aria-disabled", "true");
  window.clearTimeout(state.qualityTimer);
  state.qualityTimer = window.setTimeout(() => {
    state.qualityTimer = null;
    convertActiveImage();
  }, QUALITY_UPDATE_DELAY);
});

elements.downloadButton.addEventListener("click", (event) => {
  if (elements.downloadButton.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
    return;
  }

  if (state.images.length > 1) {
    event.preventDefault();
    downloadAllImages().catch(() => {});
  }
});

new ResizeObserver(updateZoom).observe(elements.imageComparison);
window.addEventListener("beforeunload", releaseAllImageUrls);

updateRangeFill(elements.qualitySlider);
elements.uploadTooltip.hidden = false;
window.setTimeout(hideUploadTooltip, 3000);
loadSampleImage();
