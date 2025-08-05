const { app, BrowserWindow, globalShortcut, desktopCapturer } = require('electron');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config();

let mainWindow;
let screenshotCount = 0;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: 'rgba(153, 153, 153, 0)',
    opacity: 0.5
  });

  mainWindow.loadFile('index.html');

  mainWindow.setContentProtection(true);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  globalShortcut.register('Command+Left', () => {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ x: bounds.x - 10, y: bounds.y, width: bounds.width, height: bounds.height });
  });

  globalShortcut.register('Command+Right', () => {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ x: bounds.x + 10, y: bounds.y, width: bounds.width, height: bounds.height });
  });

  globalShortcut.register('Command+Up', () => {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ x: bounds.x, y: bounds.y - 10, width: bounds.width, height: bounds.height });
  });

  globalShortcut.register('Command+Down', () => {
    const bounds = mainWindow.getBounds();
    mainWindow.setBounds({ x: bounds.x, y: bounds.y + 10, width: bounds.width, height: bounds.height });
  });

  globalShortcut.register('Command+Shift+Up', () => {
    mainWindow.webContents.executeJavaScript(`
      const h1 = document.querySelector('h1');
      h1.scrollTop = Math.max(0, h1.scrollTop - 50);
    `);
  });

  globalShortcut.register('Command+Shift+Down', () => {
    mainWindow.webContents.executeJavaScript(`
      const h1 = document.querySelector('h1');
      h1.scrollTop = h1.scrollTop + 50;
    `);
  });

  globalShortcut.register('Command+1', async () => {
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      });

      if (sources.length > 0) {
        const screenSource = sources[0];
        const image = await screenSource.thumbnail.toPNG();

        const screenshotPath = path.join(__dirname, `screenshot_${++screenshotCount}.png`);
        fs.writeFileSync(screenshotPath, image);

        console.log(`Screenshot saved: ${screenshotPath}`);
        console.log(`Image size: ${image.length} bytes`);
      } else {
        console.error('No screen sources available');
      }
    } catch (error) {
      console.error('Error taking screenshot:', error);
    }
  });

  globalShortcut.register('Command+2', async () => {
    try {
      if (screenshotCount === 0) {
        mainWindow.webContents.executeJavaScript(
          `document.querySelector('h1').innerText = 'No screenshots to send. Take a screenshot first with Command+1.';`
        );
        return;
      }

      mainWindow.webContents.executeJavaScript(
        `document.querySelector('h1').innerText = 'Loading...';`
      );

      const screenshots = [];
      for (let i = 1; i <= screenshotCount; i++) {
        const screenshotPath = path.join(__dirname, `screenshot_${i}.png`);
        if (fs.existsSync(screenshotPath)) {
          const buffer = fs.readFileSync(screenshotPath);
          const base64Image = buffer.toString('base64');
          screenshots.push(base64Image);
          console.log(`Loaded screenshot ${i}: ${base64Image.length} characters in base64`);
        }
      }

      if (screenshots.length === 0) {
        mainWindow.webContents.executeJavaScript(
          `document.querySelector('h1').innerText = 'No screenshot files found.';`
        );
        return;
      }

      const promptPath = path.join(__dirname, 'prompt');
      let promptContent = '';

      try {
        promptContent = fs.readFileSync(promptPath, 'utf-8');
      } catch (err) {
        console.error('Error reading prompt file:', err);
        mainWindow.webContents.executeJavaScript(
          `document.querySelector('h1').innerText = 'Error reading prompt file.';`
        );
        return;
      }

      // Construir a mensagem com texto e imagem para GPT-4 Vision
      const messages = [
        { role: 'system', content: 'You are a helpful programming tutor who helps students practice coding interviews.' },
        { 
          role: 'user', 
          content: [
            {
              type: 'text',
              text: `Analise a imagem que mostra um problema de programação e me ajude a resolvê-lo. Por favor, responda em português seguindo este formato:

1. Entendimento do problema - reformule o problema com suas palavras, de forma simples
2. Primeira abordagem - explique uma solução simples
3. Otimização - como melhorar a solução
4. Implementação - mostre o código passo a passo, detalhando cada linha e explicando o que ela faz
5. Análise de complexidade
6. Me liste possiveis melhorias e alternativas

Responda como se fosse meu tutor me ajudando a praticar para entrevistas, sempre na primeira pessoa, de forma simples de entender.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${screenshots[0]}`,
                detail: "high"
              }
            }
          ]
        }
      ];

      console.log('Enviando para API:', {
        model: 'gpt-4o',
        promptLength: promptContent.length,
        imageSize: screenshots[0].length,
        hasImage: screenshots.length > 0
      });

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 16384
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const result = response.data.choices[0].message.content;

      // Printar a resposta da API no terminal
      console.log('Resposta da API:', result);
      
      // Debug adicional
      console.log('Finish reason:', response.data.choices[0].finish_reason);
      console.log('Usage:', response.data.usage);

      // Redirecionar o resultado para o elemento <h1>
      mainWindow.webContents.executeJavaScript(
        `document.querySelector('h1').innerText = ${JSON.stringify(result)};`
      );

      for (let i = 1; i <= screenshotCount; i++) {
        const screenshotPath = path.join(__dirname, `screenshot_${i}.png`);
        if (fs.existsSync(screenshotPath)) {
          fs.unlinkSync(screenshotPath);
        }
      }

      screenshotCount = 0;

    } catch (error) {
      console.error('Error processing screenshots:', error);
      
      let errorMessage = 'Error processing screenshots.';
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 429) {
          errorMessage = 'Rate limit exceeded. Please wait and try again.';
        } else if (status === 401) {
          errorMessage = 'API key invalid or unauthorized.';
        } else if (status === 403) {
          errorMessage = 'Access forbidden. Check your API key permissions.';
        } else if (data && data.error && data.error.message) {
          errorMessage = `API Error: ${data.error.message}`;
        } else {
          errorMessage = `HTTP Error ${status}: ${error.response.statusText}`;
        }
      } else if (error.request) {
        errorMessage = 'Network error: Unable to reach OpenAI API.';
      }
      
      mainWindow.webContents.executeJavaScript(
        `document.querySelector('h1').innerText = ${JSON.stringify(errorMessage)};`
      );
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
