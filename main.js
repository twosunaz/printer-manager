import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfPrinter from 'pdf-to-printer'; // For printing PDFs
import PDFDocument from 'pdfkit'; // For generating PDFs
import fs from 'fs'; // For file handling
import WebSocket from 'ws';

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let liveWebSocket; // Keep track of the WebSocket connection

// Create the main window
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Important for security
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Send the list of printers to the renderer process
  mainWindow.webContents.once('did-finish-load', async () => {
    try {
      const printers = await pdfPrinter.getPrinters();
      console.log('Available Printers:', printers);
      mainWindow.webContents.send('printers-list', printers);
    } catch (error) {
      console.error('Error fetching printers:', error.message);
      mainWindow.webContents.send('printers-list', []);
    }
  });
};

// Electron app lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// WebSocket server URL
const EC2_WS_URL = 'ws://52.52.35.80:8080';

// Handle printer registration
ipcMain.on('register-printer', (event, data) => {
  console.log(`Registering printer: ${JSON.stringify(data)}`);

  const ws = new WebSocket(EC2_WS_URL);

  ws.on('open', () => {
    const message = `Connected to server. Sending registration for ${data.printerId}`;
    console.log(message);
    mainWindow.webContents.send('server-response', message);

    ws.send(JSON.stringify({ action: 'register', ...data }));
  });

  ws.on('message', (message) => {
    const response = `Server response: ${message}`;
    console.log(response);
    mainWindow.webContents.send('server-response', response);
    ws.close();
  });

  ws.on('error', (error) => {
    const errorMessage = `WebSocket error: ${error.message}`;
    console.error(errorMessage);
    mainWindow.webContents.send('server-response', errorMessage);
  });

  ws.on('close', () => {
    const closeMessage = 'WebSocket connection closed';
    console.log(closeMessage);
    mainWindow.webContents.send('server-response', closeMessage);
  });
});

// Handle "Go Live" action
ipcMain.on('go-live', (event, { printerId }) => {
  console.log(`Going live with printer: ${printerId}`);

  if (liveWebSocket && liveWebSocket.readyState === WebSocket.OPEN) {
    liveWebSocket.close(); // Close any existing connection
  }

  liveWebSocket = new WebSocket(`${EC2_WS_URL}?id=${encodeURIComponent(printerId)}`);

  liveWebSocket.on('open', () => {
    const message = `Printer ${printerId} is now live and connected to the server.`;
    console.log(message);
    mainWindow.webContents.send('server-response', message);
  });

  liveWebSocket.on('message', (message) => {
    const response = `Server to Printer: ${message}`;
    console.log(response);
    mainWindow.webContents.send('server-response', response);
    // Handle printing logic
    handlePrintJob(message, printerId);
  });

  liveWebSocket.on('error', (error) => {
    const errorMessage = `WebSocket error: ${error.message}`;
    console.error(errorMessage);
    mainWindow.webContents.send('server-response', errorMessage);
  });

  liveWebSocket.on('close', () => {
    const closeMessage = `Printer ${printerId} disconnected from the server.`;
    console.log(closeMessage);
    mainWindow.webContents.send('server-response', closeMessage);
  });
});

// Handle printing logic
const handlePrintJob = async (message, printerId) => {
  try {
    const job = JSON.parse(message);
    const pdfFilePath = path.join(__dirname, 'print-job.pdf');
    console.log(`Received print job: ${JSON.stringify(job.content)}. Generating PDF...`);

    // Generate and print the PDF
    await generatePDF(job.content, pdfFilePath);
    await pdfPrinter.print(pdfFilePath, { printer: printerId });

    const successMessage = `Print job successfully completed on printer: ${printerId}`;
    console.log(successMessage);
    mainWindow.webContents.send('server-response', successMessage);
  } catch (error) {
    const errorMessage = `Failed to print job on printer: ${error.message}`;
    console.error(errorMessage);
    mainWindow.webContents.send('server-response', errorMessage);
  }
};

// Function to generate PDF
const generatePDF = (content, filePath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);
    doc.text(typeof content === 'object' ? JSON.stringify(content, null, 2) : content);
    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });
};
