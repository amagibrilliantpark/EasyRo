const { spawn } = require('child_process');
const http = require('http');

// Start OpenCode server
const opencodePath = 'c:\\Users\\ozsoy\\Desktop\\EasyRo\\EasyRo\\opencode.exe';
const port = 4096;
const projectPath = 'c:\\Users\\ozsoy\\Desktop\\EasyRo\\EasyRo';

console.log('Starting OpenCode server...');
const opencodeProcess = spawn(opencodePath, ['serve', '--port', port.toString()], {
  cwd: projectPath,
  stdio: 'inherit'
});

opencodeProcess.on('error', (err) => {
  console.error('Failed to start OpenCode:', err);
  process.exit(1);
});

// Wait for server to start
setTimeout(async () => {
  console.log('Waiting for OpenCode to be ready...');
  
  // Health check
  let retries = 0;
  while (retries < 30) {
    try {
      await httpGet(`http://127.0.0.1:${port}/global/health`);
      console.log('OpenCode is ready!');
      break;
    } catch (e) {
      retries++;
      await sleep(1000);
    }
  }
  
  if (retries >= 30) {
    console.error('OpenCode failed to start');
    opencodeProcess.kill();
    process.exit(1);
  }
  
  // Test revert functionality
  await testRevert();
  
  // Cleanup
  console.log('Cleaning up...');
  opencodeProcess.kill();
  process.exit(0);
}, 3000);

async function testRevert() {
  console.log('\n=== Testing Revert Functionality ===\n');
  
  // Step 1: Create a session
  console.log('Step 1: Creating session...');
  const session = await httpPost(`http://127.0.0.1:${port}/session`, { title: 'Test Revert Session' });
  console.log('Session created:', session.id);
  const sessionId = session.id;
  
  // Step 2: Send first message
  console.log('\nStep 2: Sending first message...');
  const msg1 = await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/message`, {
    parts: [{ type: 'text', text: 'Hello, this is message 1' }]
  });
  console.log('Message 1 sent');
  await sleep(2000);
  
  // Step 3: Get messages to find message ID
  console.log('\nStep 3: Getting messages...');
  const messages = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  console.log('Messages:', JSON.stringify(messages, null, 2));
  
  if (!messages || messages.length === 0) {
    console.error('No messages found');
    return;
  }
  
  const firstMessageId = messages[0].info?.id;
  console.log('First message ID:', firstMessageId);
  
  // Step 4: Send second message
  console.log('\nStep 4: Sending second message...');
  const msg2 = await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/message`, {
    parts: [{ type: 'text', text: 'This is message 2' }]
  });
  console.log('Message 2 sent');
  await sleep(2000);
  
  // Step 5: Get messages again
  console.log('\nStep 5: Getting messages after second message...');
  const messages2 = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  console.log('Messages after second:', JSON.stringify(messages2, null, 2));
  
  // Step 6: Revert to first message
  console.log('\nStep 6: Reverting to first message...');
  try {
    const revertResult = await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/revert`, {
      messageID: firstMessageId
    });
    console.log('Revert result:', JSON.stringify(revertResult, null, 2));
  } catch (e) {
    console.error('Revert failed:', e.message);
  }
  
  await sleep(1000);
  
  // Step 7: Get messages after revert
  console.log('\nStep 7: Getting messages after revert...');
  const messagesAfterRevert = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  console.log('Messages after revert:', JSON.stringify(messagesAfterRevert, null, 2));
  
  // Step 8: Send new message after revert (THIS IS THE KEY TEST)
  console.log('\nStep 8: Sending new message after revert...');
  try {
    const msg3 = await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/prompt_async`, {
      parts: [{ type: 'text', text: 'This is a new message after revert' }],
      messageID: generateMessageId()
    });
    console.log('Message 3 sent (async):', JSON.stringify(msg3, null, 2));
    
    // Wait for response
    console.log('Waiting for response...');
    await sleep(5000);
    
    // Get messages again
    const messagesFinal = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
    console.log('Final messages:', JSON.stringify(messagesFinal, null, 2));
    
  } catch (e) {
    console.error('Send after revert failed:', e.message);
  }
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch {
          resolve(responseData);
        }
      });
    }).on('error', reject);
    
    req.write(data);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateMessageId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}
