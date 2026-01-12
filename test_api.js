


const BASE_URL = 'http://localhost:3050';

async function testApi() {
    console.log(`Testing API at ${BASE_URL}...`);

    try {
        // 1. Login
        console.log('1. Attempting Login...');
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin@admin.com', password: 'admin123' })
        });

        if (!loginRes.ok) {
            const text = await loginRes.text();
            console.error('Login Failed:', loginRes.status, text);
            return;
        }

        const loginData = await loginRes.json();
        const token = loginData.token;
        console.log('Login Successful. Token received.');

        // 2. Create Auto Reply
        console.log('2. Creating Auto Reply Rule...');
        const createRes = await fetch(`${BASE_URL}/api/autoreply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                keyword: 'test_script',
                response: 'response_script',
                matchType: 'exact'
            })
        });

        if (createRes.ok) {
            console.log('✅ Rule Created Successfully!');
            const rule = await createRes.json();
            console.log(rule);
        } else {
            const text = await createRes.text();
            console.error('❌ Create Rule Failed:', createRes.status, text);
        }

    } catch (error) {
        console.error('❌ Network/Connection Error:', error.message);
    }
}

testApi();
