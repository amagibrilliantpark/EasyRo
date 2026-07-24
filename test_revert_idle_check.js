const { spawn } = require('child_process');
const http = require('http');

// Start OpenCode server
const opencodePath = 'c:\\Users\\ozsoy\\Desktop\\EasyRo\\EasyRo\\opencode.exe';
const port = 4098; // Different port
const projectPath = 'c:\\Users\\ozsoy\\Desktop\\EasyRo\\EasyRo';

console.log('Starting OpenCode server on port', port, '...');
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
  
  await testRevertWithIdleCheck();
  
  console.log('Cleaning up...');
  opencodeProcess.kill();
  process.exit(0);
}, 3000);

async function testRevertWithIdleCheck() {
  console.log('\n=== Testing Revert with Session Idle Check ===\n');
  
  // Step 1: Create session
  console.log('Step 1: Creating session...');
  const session = await httpPost(`http://127.0.0.1:${port}/session`, { title: 'Test Idle Check' });
  const sessionId = session.id;
  console.log('Session created:', sessionId);
  
  // Step 2: Start SSE
  console.log('\nStep 2: Starting SSE connection...');
  const sseEvents = [];
  let idleReceived = false;
  startSSE(port, sessionId, sseEvents, () => { idleReceived = true; });
  
  // Step 3: Send first message
  console.log('\nStep 3: Sending first message...');
  const msg1Id = generateMessageId();
  await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/prompt_async`, {
    parts: [{ type: 'text', text: 'First message' }],
    messageID: msg1Id
  });
  console.log('Message 1 sent');
  
  // Wait for idle
  console.log('Waiting for session.idle...');
  await waitForIdle(() => idleReceived, () => { idleReceived = false; });
  console.log('Session idle received');
  
  // Step 4: Get messages
  const messages1 = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  const firstApiMsgId = messages1.find(m => m.info?.role === 'user')?.info?.id;
  console.log('First API message ID:', firstApiMsgId);
  
  // Step 5: Send second message
  console.log('\nStep 5: Sending second message...');
  const msg2Id = generateMessageId();
  await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/prompt_async`, {
    parts: [{ type: 'text', text: 'Second message' }],
    messageID: msg2Id
  });
  console.log('Message 2 sent');
  
  // Wait for idle
  console.log('Waiting for session.idle...');
  await waitForIdle(() => idleReceived, () => { idleReceived = false; });
  console.log('Session idle received');
  
  // Step 6: Revert
  console.log('\nStep 6: Reverting to first message...');
  await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/revert`, {
    messageID: firstApiMsgId
  });
  console.log('Revert done');
  await sleep(2000);
  
  // Step 7: Get messages after revert
  const messagesAfterRevert = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  console.log('Message count after revert:', messagesAfterRevert.length);
  
  // Step 8: Send new message after revert
  console.log('\nStep 8: Sending new message after revert...');
  sseEvents.length = 0; // Clear events
  
  const msg3Id = generateMessageId();
  console.log('Custom messageID:', msg3Id);
  
  await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/prompt_async`, {
    parts: [{ type: 'text', text: 'New message after revert' }],
    messageID: msg3Id
  });
  console.log('Message 3 sent');
  
  // Wait for idle with timeout
  console.log('\nStep 9: Waiting for session.idle (max 15 seconds)...');
  const idleWaitStart = Date.now();
  let idleReceivedInTime = false;
  
  while (Date.now() - idleWaitStart < 15000) {
    if (idleReceived) {
      idleReceivedInTime = true;
      console.log('Session idle received after', Date.now() - idleWaitStart, 'ms');
      break;
    }
    await sleep(100);
  }
  
  if (!idleReceivedInTime) {
    console.log('WARNING: session.idle NOT received within 15 seconds!');
  }
  
  // Step 10: Get final messages
  console.log('\nStep 10: Getting final messages...');
  const messagesFinal = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  console.log('Final message count:', messagesFinal.length);
  
  // Analyze messages
  console.log('\n=== Message Analysis ===');
  messagesFinal.forEach((msg, i) => {
    console.log(`Message ${i}: role=${msg.info?.role}, id=${msg.info?.id}`);
    if (msg.parts) {
      const textParts = msg.parts.filter(p => p.type === 'text' && p.text);
      console.log(`  Text parts: ${textParts.length}`);
      textParts.forEach(tp => console.log(`    - ${tp.text.substring(0, 50)}...`));
    }
  });
  
  // Check SSE events
  console.log('\n=== SSE Events After Revert Send ===');
  console.log('Total events:', sseEvents.length);
  const eventTypes = {};
  sseEvents.forEach(e => {
    eventTypes[e.type] = (eventTypes[e.type] || 0) + 1;
  });
  console.log('Event types:', eventTypes);
  
  // Check if session.idle was in the events
  const hasIdleEvent = sseEvents.some(e => e.type === 'session.idle');
  console.log('Has session.idle event:', hasIdleEvent);
}

function startSSE(port, targetSessionId, eventArray, onIdle) {
  const req = http.get(`http://127.0.0.1:${port}/event`, (res) => {
    console.log('SSE connected');
    let buffer = '';
    let dataBuffer = '';
    
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          dataBuffer += (dataBuffer ? '\n' : '') + line.slice(6);
        } else if (line.trim() === '' && dataBuffer) {
          try {
            const data = JSON.parse(dataBuffer);
            const eventSessionId = data.properties?.sessionID || data.properties?.id;
            if (eventSessionId === targetSessionId) {
              eventArray.push(data);
              if (data.type === 'session.idle' && onIdle) {
                onIdle();
              }
            }
          } catch (e) {
            // ignore parse errors
          }
          dataBuffer = '';
        }
      }
    });
    
    res.on('end', () => {
      console.log('SSE stream ended');
    });
  });
  
  req.on('error', (err) => {
    console.error('SSE error:', err.message);
  });
}

async function waitForIdle(checkIdle, resetIdle) {
  resetIdle();
  const maxWait = 10000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (checkIdle()) return;
    await sleep(100);
  }
  console.log('WARNING: Timeout waiting for idle');
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
