## Project Overview
This project is a Twitter Analytics Dashboard built with Node.js, Express, EJS, and Puppeteer. It automates Twitter interactions to extract and present Ethereum-related engagement data, including top tweets, personal tweets, engagers, and following accounts.

## File Structure

project-root/
│
├── node_modules/                # Installed npm packages
│
├── public/                      # Static files served (CSS, client-side JS, images)
│   └── css/
│        └── styles.css           # Stylesheet for frontend
│
├── routes/
│   ├── follow.js                # Express route to trigger following Ethereum accounts
│   ├── engagers.js              # Express route to trigger searching latest engagers
│   ├── search.js                # Express route to trigger searching top Ethereum tweets
│   └── myTop.js                 # Express route to trigger searching my latest tweets
│
├── views/
│   └── dashboard.ejs            # EJS template for the dashboard page. Entire Frontend
│
├── followEthereumAccounts.js    # Puppeteer script to follow Ethereum-related Twitter accounts and generate XLSX report
│
├── scrapeLatestEngagers.js      # Puppeteer script to search latest engagers
│
├── scrapeTopTweets.js           # Puppeteer script to search my latest tweets
│
├── twitterScrape.js             # Puppeteer script to search top Ethereum tweets
│
├── .env                         # Stores environment-specific variables
├── server.js                    # Express app initialization and middleware setup
├── package.json                 # Project metadata and npm dependencies
├── package-lock.json            # Exact versions of installed npm packages
└── README.md                    # Project overview, setup instructions, and file explanations


## How to Run the APP

1. Manually launch Chrome in terminal using:
    open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"
2. Open x and login.
3. Launch project on terminal using:
    node server.js
4. Open a new tab for http://localhost:3000/
5. Click any button

