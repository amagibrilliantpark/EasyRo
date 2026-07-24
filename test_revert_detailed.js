const { spawn } = require('child_process');
const http = require('http');

// Start OpenCode server
const opencodePath = 'c:\\Users\\ozsoy\\Desktop\\EasyRo\\EasyRo\\opencode.exe';
const port = 4097; // Different port to avoid conflict
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
  
  // Test revert with SSE monitoring
  await testRevertWithSSE();
  
  // Cleanup
  console.log('Cleaning up...');
  opencodeProcess.kill();
  process.exit(0);
}, 3000);

async function testRevertWithSSE() {
  console.log('\n=== Testing Revert with SSE Monitoring ===\n');
  
  // Step 1: Create a session
  console.log('Step 1: Creating session...');
  const session = await httpPost(`http://127.0.0.1:${port}/session`, { title: 'Test SSE Revert' });
  console.log('Session created:', session.id);
  const sessionId = session.id;
  
  // Step 2: Start SSE connection
  console.log('\nStep 2: Starting SSE connection...');
  const sseEvents = [];
  startSSE(port, sessionId, sseEvents);
  
  // Step 3: Send first message
  console.log('\nStep 3: Sending first message...');
  const msg1Id = generateMessageId();
  const msg1 = await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/prompt_async`, {
    parts: [{ type: 'text', text: 'First message' }],
    messageID: msg1Id
  });
  console.log('Message 1 sent with ID:', msg1Id);
  await sleep(3000);
  
  // Step 4: Get messages
  console.log('\nStep 4: Getting messages...');
  const messages1 = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  console.log('Message count:', messages1.length);
  const firstApiMsgId = messages1.find(m => m.info?.role === 'user')?.info?.id;
  console.log('First API message ID:', firstApiMsgId);
  
  // Step 5: Send second message
  console.log('\nStep 5: Sending second message...');
  const msg2Id = generateMessageId();
  const msg2 = await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/prompt_async`, {
    parts: [{ type: 'text', text: 'Second message' }],
    messageID: msg2Id
  });
  console.log('Message 2 sent with ID:', msg2Id);
  await sleep(3000);
  
  // Step 6: Get messages again
  console.log('\nStep 6: Getting messages after second...');
  const messages2 = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  console.log('Message count:', messages2.length);
  
  // Step 7: Revert to first message
  console.log('\nStep 7: Reverting to first message...');
  const revertResult = await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/revert`, {
    messageID: firstApiMsgId
  });
  console.log('Revert result:', JSON.stringify(revertResult, null, 2));
  await sleep(2000);
  
  // Step 8: Get messages after revert
  console.log('\nStep 8: Getting messages after revert...');
  const messagesAfterRevert = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  console.log('Message count after revert:', messagesAfterRevert.length);
  
  // Step 9: Send new message after revert (with custom messageID like EasyRo does)
  console.log('\nStep 9: Sending new message after revert with custom messageID...');
  const msg3Id = generateMessageId();
  console.log('Custom messageID:', msg3Id);
  
  // Clear SSE events before sending
  sseEvents.length = 0;
  
  const msg3 = await httpPost(`http://127.0.0.1:${port}/session/${sessionId}/prompt_async`, {
    parts: [{ type: 'text', text: 'New message after revert' }],
    messageID: msg3Id
  });
  console.log('Message 3 sent');
  
  // Wait for SSE events
  console.log('\nStep 10: Waiting for SSE events...');
  await sleep(5000);
  
  console.log('\n=== SSE Events Received After Revert Send ===');
  console.log('Total events:', sseEvents.length);
  sseEvents.forEach((event, i) => {
    console.log(`Event ${i}: type=${event.type}, sessionID=${event.properties?.sessionID || event.properties?.id}`);
    if (event.type === 'message.part.updated') {
      console.log(`  Part ID: ${event.properties?.part?.id}, Message ID: ${event.properties?.part?.messageID}`);
    }
  });
  
  // Step 11: Get final messages
  console.log('\nStep 11: Getting final messages...');
  const messagesFinal = await httpGet(`http://127.0.0.1:${port}/session/${sessionId}/message`);
  console.log('Final message count:', messagesFinal.length);
  
  // Check if the new message got a response
  const lastMessage = messagesFinal[messagesFinal.length - 1];
  console.log('Last message role:', lastMessage?.info?.role);
  console.log('Last message has text parts:', lastMessage?.parts?.some(p => p.type === 'text' && p.text));
}

function startSSE(port, targetSessionId, eventArray) {
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
            // Only log events for our target session
            const eventSessionId = data.properties?.sessionID || data.properties?.id;
            if (eventSessionId === targetSessionId) {
              eventArray.push(data);
              console.log(`[SSE] ${data.type} for session ${eventSessionId}`);
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
