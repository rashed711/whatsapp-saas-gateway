
// Native fetch is available in Node.js 18+

async function testListUsers() {
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

        if (!loginRes.ok) {
            console.error('Login Failed:', loginData);
            process.exit(1);
        }

        const token = loginData.token;
        console.log('Got Admin Token');

        console.log('Fetching users list...');
        const listRes = await fetch('http://localhost:3050/api/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!listRes.ok) {
            const errData = await listRes.text();
            console.error('List Users Failed:', listRes.status, errData);
        } else {
            const users = await listRes.json();
            console.log('List Users Success. Count:', Array.isArray(users) ? users.length : 'Not Array');
            console.log('Users:', JSON.stringify(users, null, 2));
        }

    } catch (error) {
        console.error('Script Error:', error);
    }
}

testListUsers();
