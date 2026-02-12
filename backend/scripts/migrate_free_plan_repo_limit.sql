-- Increase free plan max_repos from 3 to 5
UPDATE plans SET max_repos = 5 WHERE tier = 'free' AND max_repos = 3;
