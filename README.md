# DeSci Journal DAO: A Decentralized Science Publishing Revolution

DeSci Journal DAO is an innovative platform that leverages **Zama's Fully Homomorphic Encryption technology** to create a secure, decentralized academic journal. This decentralized autonomous organization (DAO) consists of scholars who collectively curate and fund DeSci research papers, facilitating a transparent and fair academic publishing process through encrypted peer reviews and decision-making.

## The Problem at Hand

The traditional academic publishing system has long been plagued by issues such as lack of transparency, biased peer reviews, and high publication fees. Many researchers find it challenging to get their work published due to gatekeeping by established journals, leading to a significant barrier for emerging ideas and diverse voices in the scientific community. This creates a need for an alternative system that promotes fairness, collaboration, and accessibility.

## FHE: The Core of Our Solution

At the heart of the DeSci Journal DAO is the implementation of **Fully Homomorphic Encryption (FHE)** using **Zama's open-source libraries**, such as the **zama-fhe SDK**. FHE enables computations to be performed directly on encrypted data, allowing our users to submit entries, conduct peer reviews, and vote on publication decisions without revealing sensitive information. This ensures privacy and integrity in the review process while maintaining a high level of confidentiality for all participants.

By harnessing Zama’s technology, DeSci Journal DAO creates a new paradigm for academic publishing—one that empowers scholars to govern their own work through an encrypted and anonymous voting mechanism.

## Core Functionalities

Here are some of the key features that make DeSci Journal DAO stand out:

- **Encrypted Submission and Review Process:** Authors submit their manuscripts in a secure, encrypted format. Peer reviews are conducted on these encrypted submissions, ensuring confidentiality throughout.
  
- **DAO Governance for Decision Making:** Publication decisions are made through a private voting mechanism, ensuring that all members have a voice in the process, and enhancing transparency.

- **Fair Revenue Distribution:** Royalties from published papers are distributed through privacy-preserving payments, ensuring that financial benefits reach contributors fairly.

- **Community Engagement:** A dedicated forum allows scholars to discuss submissions and reviews, fostering collaboration and knowledge sharing.

## Technology Stack

- **Zama FHE SDK:** The primary component for implementing fully homomorphic encryption capabilities.
- **Node.js:** For backend development and serving applications.
- **Hardhat/Foundry:** To manage and deploy smart contracts.
- **Solidity:** For writing smart contracts governing the DAO.
- **React:** For building a responsive frontend to interact with the DAO platform.

## Directory Structure

Here’s a high-level view of the project’s directory structure to help you navigate:

```
/DeSci_Journal_DAO
├── contracts
│   └── DeSci_Journal_DAO.sol
├── scripts
│   └── deploy.js
├── test
│   └── test_deSci.js
├── client
│   ├── src
│   └── public
├── package.json
├── hardhat.config.js
└── README.md
```

## Installation Guide

To set up the DeSci Journal DAO project on your local machine, follow the steps below:

1. Make sure you have **Node.js** installed on your machine. You can download it from the official site.
  
2. Once Node.js is installed, navigate to the project directory.

3. Run the following command to install all dependencies, including the necessary Zama FHE libraries:
   ```bash
   npm install
   ```

4. Ensure you have Hardhat or Foundry installed to manage your smart contracts' lifecycle.

Please do not use `git clone` or any URLs to download the project files.

## Build & Run Guide

After the installation is complete, you can compile and run the project using the following commands:

1. **Compile the smart contracts:**
   ```bash
   npx hardhat compile
   ```

2. **Deploy the contracts to a local development network:**
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```

3. **Run tests to ensure everything is functioning as intended:**
   ```bash
   npx hardhat test
   ```

4. **Start the client application:**
   ```bash
   cd client
   npm start
   ```

This will launch the application, allowing you to interact with the DeSci Journal DAO via your web browser.

## Acknowledgements

### Powered by Zama

We extend our heartfelt gratitude to the Zama team for their pioneering work in the realm of fully homomorphic encryption. Their open-source tools and libraries have been instrumental in making confidential blockchain applications like the DeSci Journal DAO a reality. By harnessing cutting-edge encryption technology, we are paving the way for a more transparent and inclusive academic publishing landscape.

---

Join us in revolutionizing the world of academic publishing and contribute to a more equitable future for researchers everywhere! Together, we can create a new standard for scholarly communication that prioritizes collaboration and integrity.
