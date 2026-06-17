import requests
s = requests.Session()
r = s.post("http://localhost:8000/api/auth/login", json={"email":"admin@nitt.edu","password":"iris@123"})
if r.status_code == 200:
    print(r.json())
    user = s.get("http://localhost:8000/api/auth/me").json()
    print("User:", user)
else:
    print("Login failed", r.text)
