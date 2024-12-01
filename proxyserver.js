import WebSocket from 'ws';
import express from 'express';
import bodyParser from 'body-parser';
import pdfPrinter from 'pdf-to-printer';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import path from 'path';

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

const printerId = encodeURIComponent('Brother DCP-L2550DW series Printer'); // Replace with actual printer name or ID
const EC2_WS_URL = `ws://52.52.35.80:8080?id=${printerId}`; // WebSocket URL with printerId

let ws;

// Connect to EC2 WebSocket server
const connectToServer = () => {
  ws = new WebSocket(EC2_WS_URL);

  ws.on('open', () => {
    console.log(`Connected to EC2 WebSocket server with printerId: ${decodeURIComponent(printerId)}`);
  });

  ws.on('message', async (message) => {
    console.log('Received message:', message);

    try {
      const data = JSON.parse(message);
      const pdfFilePath = path.join(__dirname, 'print-job.pdf');
      console.log('Generating PDF at:', pdfFilePath);

      // Generate the PDF
      await generatePDF(data.content, pdfFilePath);

      const options = {
        printer: decodeURIComponent(printerId), // Explicitly specify the printer name
      };

      console.log('Printing to printer:', options.printer);
      console.log('File path for printing:', pdfFilePath);

      // Attempt to print the PDF
      await pdfPrinter.print(pdfFilePath, options);
      console.log('Print job completed');
    } catch (error) {
      console.error('Failed to print:', error.message);
    }
  });

  ws.on('close', () => {
    console.log('Disconnected from EC2 server. Reconnecting...');
    setTimeout(connectToServer, 5000); // Attempt to reconnect after 5 seconds
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
};

// Start WebSocket connection
connectToServer();

// Function to generate PDF
const generatePDF = (content, filePath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const writeStream = fs.createWriteStream(filePath);

      doc.pipe(writeStream);

      const formattedContent = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
      doc.text(formattedContent); // Add content to the PDF
      doc.end();

      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};

// Start the proxy server
app.listen(PORT, () => {
  console.log(`Printer manager running on http://localhost:${PORT}`);
});
