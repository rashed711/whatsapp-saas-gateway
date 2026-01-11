
// Native fetch is available in Node.js 18+ (User has v22)

async function testRegister() {
    try {
        console.log('Logging in as admin...');
        const loginRes = await fetch('http://localhost:3050/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'admin@admin.com',
                password: 'admin123'
            })
        });

        const loginData: any = await loginRes.json();
        console.log('Login Status:', loginRes.status);

        if (!loginRes.ok) {
            console.error('Login Failed:', loginData);
            process.exit(1);
        }

        const token = loginData.token;
        console.log('Got Admin Token');

        // 2. Register new user
        const newUser = {
            name: 'API Test User',
            username: `user_${Date.now()}@test.com`,
            password: 'password123'
        };

        console.log('Attempting to register new user:', newUser.username);
        const regRes = await fetch('http://localhost:3050/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(newUser)
        });

        const regData = await regRes.json();
        console.log('Register Status:', regRes.status);
        console.log('Register Response:', JSON.stringify(regData, null, 2));

    } catch (error) {
        console.error('Script Error:', error);
    }
}

testRegister();
