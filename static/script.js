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
  downloadButtonLabel: document.getElementById("downloadButtonLabel"),
  downloadProgressContainer: document.getElementById("downloadProgressContainer"),
  downloadProgress: document.getElementById("downloadProgress"),
  downloadProgressValue: document.getElementById("downloadProgressValue"),
  originalSize: document.getElementById("originalSize"),
  webpSize: document.getElementById("webpSize"),
  sizeChange: document.getElementById("sizeChange"),
};

const MAX_IMAGES = 20;
const QUALITY_UPDATE_DELAY = 140;
const TEMP_URL_LIFETIME = 120000;

const sampleImagePaths = [
  "./images/img_01.jpg",
  "./images/img_02.jpg",
  "./images/img_03.jpg",
  "./images/img_04.jpg",
  "./images/img_05.jpg",
];

const SAMPLE_NOTICE_DURATION = 3000;

// The sample is shown in the comparison but is never added to the user's list.
const state = {
  images: [],
  activeImage: null,
  sampleImage: null,
  conversionId: 0,
  conversionInProgress: false,
  batchDownloadInProgress: false,
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
  elements.downloadButton.setAttribute(
    "aria-disabled",
    String(
      state.images.length === 0 ||
        !state.activeImage ||
        state.activeImage === state.sampleImage ||
        !state.activeImage.convertedUrl ||
        state.batchDownloadInProgress,
    ),
  );
  syncDownloadButtonLabel();
}

function syncDownloadButtonLabel() {
  elements.downloadButtonLabel.textContent =
    state.conversionInProgress
      ? "Convert to WebP"
      : state.images.length > 1
        ? "Download All WebP"
        : "Download WebP";
  const showProgress = state.batchDownloadInProgress;
  elements.downloadButtonLabel.hidden = showProgress;
  elements.downloadProgressContainer.hidden = !showProgress;
}

function updateBatchDownloadProgress(value) {
  const progress = Math.max(0, Math.min(100, Math.round(value)));
  elements.downloadProgress.value = progress;
  elements.downloadProgressValue.textContent = `${progress}%`;
}

function setDownloadState(url = null) {
  const canDownload = Boolean(
    url && state.images.length > 0 && state.activeImage !== state.sampleImage,
  );
  elements.downloadButton.href = canDownload ? url : "#";
  elements.downloadButton.setAttribute("aria-disabled", String(!canDownload));
  syncDownloadButtonLabel();
}

function createImageEntry(file) {
  return {
    file,
    originalUrl: URL.createObjectURL(file),
    convertedUrl: null,
    convertedQuality: null,
  };
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
  elements.originalSize.textContent = `Original ${getFileFormat(sourceFile)} Size: ${formatFileSize(sourceFile.size)}.`;
  elements.webpSize.textContent = `Converted WebP Size: ${formatFileSize(webpBlob.size)}.`;

  const savedPercent =
    ((sourceFile.size - webpBlob.size) / sourceFile.size) * 100;
  const sizeIncreased = savedPercent < 0;

  elements.sizeChange.textContent = sizeIncreased
    ? `Size Increased ${Math.abs(savedPercent).toFixed(1)}%.`
    : `Size Reduction: ${savedPercent.toFixed(1)}%.`;
  elements.sizeChange.classList.toggle("sizeIncreased", sizeIncreased);
}

async function convertActiveImage() {
  if (!state.activeImage) return;

  const conversionId = ++state.conversionId;
  state.conversionInProgress = true;
  syncDownloadButtonLabel();
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
    setDownloadState(imageEntry.convertedUrl);
    showConversionInfo(imageEntry.file, webpBlob);
  } catch {
    // A failed conversion leaves the download disabled; the user can try again.
    if (conversionId === state.conversionId) setDownloadState();
  } finally {
    if (conversionId === state.conversionId) {
      state.conversionInProgress = false;
      syncDownloadButtonLabel();
    }
  }
}

function getWebPFileName(fileName) {
  const nameWithoutExtension = fileName.replace(/\.[^.]+$/, "");
  return `${nameWithoutExtension || fileName}.webp`;
}

function calculateCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate =
    ((Math.max(1980, now.getFullYear()) - 1980) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate();

  const makeHeader = (size) => new Uint8Array(size);
  const write16 = (view, offset, value) => view.setUint16(offset, value, true);
  const write32 = (view, offset, value) => view.setUint32(offset, value, true);

  files.forEach(({ fileName, bytes }) => {
    const nameBytes = encoder.encode(fileName);
    const crc = calculateCrc32(bytes);
    const localHeader = makeHeader(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write16(localView, 10, dosTime);
    write16(localView, 12, dosDate);
    write32(localView, 14, crc);
    write32(localView, 18, bytes.length);
    write32(localView, 22, bytes.length);
    write16(localView, 26, nameBytes.length);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, bytes);

    const centralHeader = makeHeader(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write16(centralView, 12, dosTime);
    write16(centralView, 14, dosDate);
    write32(centralView, 16, crc);
    write32(centralView, 20, bytes.length);
    write32(centralView, 24, bytes.length);
    write16(centralView, 28, nameBytes.length);
    write32(centralView, 38, 0);
    write32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + bytes.length;
  });

  const centralDirectory = new Blob(centralParts);
  const endRecord = makeHeader(22);
  const endView = new DataView(endRecord.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, centralDirectory.size);
  write32(endView, 16, localOffset);

  return new Blob([...localParts, centralDirectory, endRecord], {
    type: "application/zip",
  });
}

async function downloadAllImages() {
  if (state.batchDownloadInProgress) return;

  state.batchDownloadInProgress = true;
  elements.downloadButton.setAttribute("aria-disabled", "true");
  elements.downloadButton.setAttribute("aria-busy", "true");
  updateBatchDownloadProgress(0);
  syncDownloadButtonLabel();

  const quality = Number(elements.qualitySlider.value) / 100;
  const filesToDownload = [];
  const imagesToDownload = [...state.images];

  try {
    // Convert one file at a time so large images do not create many canvases at once.
    for (const [index, imageEntry] of imagesToDownload.entries()) {
      let blob;
      if (imageEntry.convertedUrl && imageEntry.convertedQuality === quality) {
        blob = await fetch(imageEntry.convertedUrl).then((response) => response.blob());
      } else {
        blob = await convertImageToWebP(imageEntry.originalUrl, quality);
      }
      filesToDownload.push({
        fileName: getWebPFileName(imageEntry.file.name),
        blob,
      });
      updateBatchDownloadProgress(((index + 1) / imagesToDownload.length) * 80);
    }

    const usedNames = new Set();
    const zipFiles = [];
    for (const { fileName, blob } of filesToDownload) {
      const baseName = fileName.replace(/\.webp$/i, "");
      let uniqueName = fileName;
      let suffix = 2;
      while (usedNames.has(uniqueName.toLowerCase())) {
        uniqueName = `${baseName} (${suffix}).webp`;
        suffix += 1;
      }
      usedNames.add(uniqueName.toLowerCase());
      zipFiles.push({
        fileName: uniqueName,
        bytes: new Uint8Array(await blob.arrayBuffer()),
      });
      updateBatchDownloadProgress(80 + (zipFiles.length / filesToDownload.length) * 15);
    }

    const zipUrl = URL.createObjectURL(createZipBlob(zipFiles));
    const downloadLink = document.createElement("a");
    downloadLink.href = zipUrl;
    downloadLink.download = "converted-images.zip";
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    updateBatchDownloadProgress(100);
    window.setTimeout(() => URL.revokeObjectURL(zipUrl), TEMP_URL_LIFETIME);
    await new Promise((resolve) => window.setTimeout(resolve, 450));
  } finally {
    state.batchDownloadInProgress = false;
    elements.downloadButton.removeAttribute("aria-busy");
    updateDownloadButton();
  }
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
    const imageInfo = document.createElement("span");
    const fileName = document.createElement("span");
    const imageDimensions = document.createElement("span");
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
    thumbnail.addEventListener("load", () => {
      imageDimensions.textContent = `${thumbnail.naturalWidth} x ${thumbnail.naturalHeight} px`;
    });
    fileName.textContent = imageEntry.file.name;
    imageInfo.className = "imageThumbnailInfo";
    fileName.className = "imageThumbnailName";
    imageDimensions.className = "imageThumbnailDimensions";
    imageInfo.append(fileName, imageDimensions);
    selectButton.append(thumbnail, imageInfo);
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

function updateImageSelectionState() {
  elements.imageList
    .querySelectorAll(".imageThumbnail")
    .forEach((button, index) => {
      button.setAttribute(
        "aria-pressed",
        String(state.images[index] === state.activeImage),
      );
    });
}

function selectImage(imageEntry, moveFocusToList = false) {
  if (imageEntry === state.activeImage) return;

  window.clearTimeout(state.qualityTimer);
  state.qualityTimer = null;
  state.activeImage = imageEntry;
  state.conversionId += 1;
  state.conversionInProgress = false;

  elements.sampleImageNotice.hidden = imageEntry !== state.sampleImage;
  elements.originalImage.src = imageEntry.originalUrl;
  elements.convertedImage.removeAttribute("src");
  setDownloadState();
  elements.imageComparison.hidden = false;
  elements.originalImage.onload = setStartingZoom;
  clearConversionInfo();
  updateImageSelectionState();
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
  elements.clearImagesButton.disabled = state.images.length === 0;
  updateDownloadButton();
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

  const newImages = acceptedFiles.map(createImageEntry);

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
  renderImageList();
  selectImage(newImages[0], moveFocusToList);
}

function deleteImage(imageEntry) {
  const imageIndex = state.images.indexOf(imageEntry);
  if (imageIndex === -1) return;

  const wasActiveImage = state.activeImage === imageEntry;
  releaseImage(imageEntry);
  state.images.splice(imageIndex, 1);
  updateImageListAfterChange();
  renderImageList();

  if (!wasActiveImage) {
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
  state.conversionInProgress = false;

  state.images.forEach(releaseImage);
  state.images.length = 0;
  state.activeImage = null;

  updateImageListAfterChange();
  elements.imageList.replaceChildren();
  elements.originalImage.removeAttribute("src");
  elements.convertedImage.removeAttribute("src");
  elements.imageComparison.hidden = true;
  setDownloadState();
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

    state.sampleImage = createImageEntry(file);

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
  state.conversionInProgress = false;
  elements.downloadButton.setAttribute("aria-disabled", "true");
  syncDownloadButtonLabel();
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
window.setTimeout(hideUploadTooltip, SAMPLE_NOTICE_DURATION);
loadSampleImage();
