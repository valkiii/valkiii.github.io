/**
 * Debug script for Connect 4 HF connection issues
 */

console.log('🔧 DEBUG: Connect 4 diagnostic script loaded');

// Function to test HF Space directly
async function testHFConnection() {
    const spaceUrl = "https://drbayes-connect4-tournament-ai.hf.space";
    console.log('🔧 DEBUG: Testing direct connection to:', spaceUrl);
    
    try {
        const response = await fetch(`${spaceUrl}/health`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });
        
        console.log('🔧 DEBUG: Response status:', response.status);
        console.log('🔧 DEBUG: Response ok:', response.ok);
        
        if (response.ok) {
            const data = await response.json();
            console.log('🔧 DEBUG: Health data:', data);
            
            // Update status on page
            const statusEl = document.getElementById('connection-status');
            if (statusEl) {
                if (data.ai_loaded === true) {
                    statusEl.innerHTML = '✅ DEBUG: AI Connected and Working!';
                    statusEl.style.color = 'green';
                } else {
                    statusEl.innerHTML = '❌ DEBUG: AI not loaded on HF Space';
                    statusEl.style.color = 'red';
                }
            }
        } else {
            console.error('🔧 DEBUG: Health check failed:', response.status);
        }
    } catch (error) {
        console.error('🔧 DEBUG: Connection error:', error);
    }
}

// Function to test a move
async function testMove() {
    const spaceUrl = "https://drbayes-connect4-tournament-ai.hf.space";
    const board = [
        [0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0]
    ];
    
    try {
        const response = await fetch(`${spaceUrl}/api/move`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ board: board })
        });
        
        console.log('🔧 DEBUG: Move response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('🔧 DEBUG: Move data:', data);
        }
    } catch (error) {
        console.error('🔧 DEBUG: Move error:', error);
    }
}

// Run tests when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 DEBUG: DOM loaded, running tests...');
    
    setTimeout(() => {
        testHFConnection();
    }, 1000);
    
    setTimeout(() => {
        testMove();
    }, 3000);
});

// Global test functions
window.testHFConnection = testHFConnection;
window.testMove = testMove;