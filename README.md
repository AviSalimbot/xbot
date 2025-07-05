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
    ./start-chrome.sh ethereum 
    ./start-chrome.sh basketball
    ./start-chrome.sh crypto
2. Open x and login.
3. Launch project on terminal using:
    node server.js
4. Open a new tab for http://localhost:3000/
5. Click any button




ENGAGEMENT SUGGESTIONS
1. Obtain trending tweets (IFTTT - X to Gsheets)
2. Obtain trending ethereum tweets (IFTTT - X to Gsheets)
3. Fetch trending tweets and trending ethereum tweets (XBOT)
4. Let AI draw connection between trending tweet and trendng ethereum tweet (XBOT)
5. Let AI generate a comment/reply (XBOT)
6. Display comment suggestions (Dashboard)

Trending Tweet  |   Ethereum Tweet   | Comment Suggestion

Questions: 
1. Given trending tweet is looped with ethereum tweets, should I:
    a. stop when a cnnection is established.
    b. continue until n connections and choose the best.


1. SCALABILITY
2. ASSOCIATION
