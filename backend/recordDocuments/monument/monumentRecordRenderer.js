// ============================================================
// monumentRecordRenderer.js
// Renders the Monument Record HTML to an A4 PDF using Playwright.
//
// The dependency is loaded lazily so simply importing this file does not
// prevent the backend from starting before Playwright is installed.
// ============================================================

const fs = require("fs/promises");
const path = require("path");

async function imageFileToDataUri(filePath) {
  const buffer = await fs.readFile(filePath);

  const extension =
    path.extname(filePath)
      .toLowerCase()
      .replace(".", "");

  const mimeType =
    extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "svg"
        ? "image/svg+xml"
        : "image/png";

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

const {
  renderMonumentRecordHtml
} = require("./monumentRecordTemplate");

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      let chromium;

      try {
        ({ chromium } = require("playwright"));
      } catch (error) {
        const wrapped = new Error(
          "Monument Record PDF rendering requires the backend Playwright package and a Chromium browser."
        );
        wrapped.cause = error;
        throw wrapped;
      }

      return chromium.launch({
        headless: true
      });
    })();
  }

  try {
    return await browserPromise;
  } catch (error) {
    browserPromise = null;
    throw error;
  }
}

async function renderMonumentRecordPdf(model) {
  const cssPath =
    path.join(
      __dirname,
      "monumentRecord.css"
    );

  const inlineCss =
    await fs.readFile(
      cssPath,
      "utf8"
    );

  const logoPath =
    path.resolve(
      __dirname,
      "../../../assets/logo.png"
    );

  const logoSrc =
    await imageFileToDataUri(
      logoPath
    );

  const modelWithAssets = {
    ...model,

    branding: {
      ...(model.branding || {}),
      logoSrc
    }
  };

  const html =
    renderMonumentRecordHtml(
      modelWithAssets,
      {
        inlineCss
      }
    );

  const browser =
    await getBrowser();

  const page =
    await browser.newPage();

  try {
    await page.setContent(
      html,
      {
        waitUntil: "networkidle"
      }
    );

    await page.emulateMedia({
      media: "print"
    });

    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true
    });
  } finally {
    await page.close();
  }
}

async function closeMonumentRecordRenderer() {
  if (!browserPromise) return;

  try {
    const browser = await browserPromise;
    await browser.close();
  } finally {
    browserPromise = null;
  }
}

module.exports = {
  renderMonumentRecordPdf,
  closeMonumentRecordRenderer
};
