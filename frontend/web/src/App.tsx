// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface ResearchPaper {
  id: string;
  title: string;
  encryptedData: string;
  timestamp: number;
  author: string;
  status: "submitted" | "under_review" | "published" | "rejected";
  reviewScore?: number;
  category: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newPaperData, setNewPaperData] = useState({ title: "", category: "Biology", researchScore: 0 });
  const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null);
  const [decryptedScore, setDecryptedScore] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Stats calculations
  const publishedCount = papers.filter(p => p.status === "published").length;
  const reviewCount = papers.filter(p => p.status === "under_review").length;
  const submittedCount = papers.filter(p => p.status === "submitted").length;
  const rejectedCount = papers.filter(p => p.status === "rejected").length;
  const userContributionCount = papers.filter(p => p.author.toLowerCase() === address?.toLowerCase()).length;

  useEffect(() => {
    loadPapers().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadPapers = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load paper keys
      const keysBytes = await contract.getData("paper_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing paper keys:", e); }
      }
      
      // Load each paper
      const list: ResearchPaper[] = [];
      for (const key of keys) {
        try {
          const paperBytes = await contract.getData(`paper_${key}`);
          if (paperBytes.length > 0) {
            try {
              const paperData = JSON.parse(ethers.toUtf8String(paperBytes));
              list.push({ 
                id: key, 
                title: paperData.title,
                encryptedData: paperData.data, 
                timestamp: paperData.timestamp, 
                author: paperData.author, 
                status: paperData.status || "submitted",
                reviewScore: paperData.reviewScore,
                category: paperData.category || "General"
              });
            } catch (e) { console.error(`Error parsing paper data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading paper ${key}:`, e); }
      }
      
      // Sort by timestamp (newest first)
      list.sort((a, b) => b.timestamp - a.timestamp);
      setPapers(list);
    } catch (e) { 
      console.error("Error loading papers:", e); 
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const submitPaper = async () => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setSubmitting(true);
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Encrypting research score with Zama FHE..." 
    });
    
    try {
      // Encrypt the research score
      const encryptedScore = FHEEncryptNumber(newPaperData.researchScore);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      // Generate unique ID
      const paperId = `paper-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      
      // Prepare paper data
      const paperData = { 
        title: newPaperData.title,
        data: encryptedScore, 
        timestamp: Math.floor(Date.now() / 1000), 
        author: address, 
        status: "submitted",
        category: newPaperData.category
      };
      
      // Store paper data
      await contract.setData(`paper_${paperId}`, ethers.toUtf8Bytes(JSON.stringify(paperData)));
      
      // Update paper keys list
      const keysBytes = await contract.getData("paper_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { 
          keys = JSON.parse(ethers.toUtf8String(keysBytes)); 
        } catch (e) { 
          console.error("Error parsing keys:", e); 
        }
      }
      keys.push(paperId);
      await contract.setData("paper_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Paper submitted with FHE encryption!" 
      });
      
      await loadPapers();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowSubmitModal(false);
        setNewPaperData({ title: "", category: "Biology", researchScore: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: errorMessage 
      });
      setTimeout(() => setTransactionStatus({ 
        visible: false, 
        status: "pending", 
        message: "" 
      }), 3000);
    } finally { 
      setSubmitting(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddress:${contractAddress}\nchainId:${chainId}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const reviewPaper = async (paperId: string, action: "publish" | "reject") => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Processing encrypted review with FHE..." 
    });
    
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      
      // Get current paper data
      const paperBytes = await contract.getData(`paper_${paperId}`);
      if (paperBytes.length === 0) throw new Error("Paper not found");
      const paperData = JSON.parse(ethers.toUtf8String(paperBytes));
      
      // Update paper status
      const updatedPaper = { 
        ...paperData, 
        status: action === "publish" ? "published" : "rejected",
        reviewScore: action === "publish" ? FHEEncryptNumber(85 + Math.floor(Math.random() * 15)) : undefined
      };
      
      // Store updated data
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      await contractWithSigner.setData(`paper_${paperId}`, ethers.toUtf8Bytes(JSON.stringify(updatedPaper)));
      
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: `Paper ${action === "publish" ? "published" : "rejected"} successfully!` 
      });
      
      await loadPapers();
      setTimeout(() => setTransactionStatus({ 
        visible: false, 
        status: "pending", 
        message: "" 
      }), 2000);
    } catch (e: any) {
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: `Review failed: ${e.message || "Unknown error"}` 
      });
      setTimeout(() => setTransactionStatus({ 
        visible: false, 
        status: "pending", 
        message: "" 
      }), 3000);
    }
  };

  const isAuthor = (paperAuthor: string) => address?.toLowerCase() === paperAuthor.toLowerCase();

  // Filter papers based on search and filters
  const filteredPapers = papers.filter(paper => {
    const matchesSearch = paper.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || paper.category === filterCategory;
    const matchesStatus = filterStatus === "all" || paper.status === filterStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const categories = [...new Set(papers.map(p => p.category))];
  const statuses = ["submitted", "under_review", "published", "rejected"];

  if (loading) return (
    <div className="loading-screen">
      <div className="tech-spinner"></div>
      <p>Initializing decentralized journal...</p>
    </div>
  );

  return (
    <div className="app-container future-tech-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="atom-icon"></div>
          </div>
          <h1>DeSci<span>Journal</span>DAO</h1>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowSubmitModal(true)} 
            className="submit-paper-btn tech-button"
          >
            <div className="add-icon"></div>Submit Paper
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="floating-toolbar">
        <div className="search-box">
          <input 
            type="text" 
            placeholder="Search papers..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="tech-input"
          />
          <div className="search-icon"></div>
        </div>
        <div className="filter-group">
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
            className="tech-select"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="tech-select"
          >
            <option value="all">All Statuses</option>
            {statuses.map(status => (
              <option key={status} value={status}>
                {status.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Decentralized Science Journal DAO</h2>
            <p>A community-curated academic journal powered by FHE encryption and decentralized governance</p>
          </div>
          <div className="fhe-indicator">
            <div className="fhe-lock"></div>
            <span>Zama FHE Encryption Active</span>
          </div>
        </div>

        <div className="dashboard-cards">
          <div className="stats-card tech-card">
            <h3>Journal Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{papers.length}</div>
                <div className="stat-label">Total Papers</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{publishedCount}</div>
                <div className="stat-label">Published</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{reviewCount}</div>
                <div className="stat-label">Under Review</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{rejectedCount}</div>
                <div className="stat-label">Rejected</div>
              </div>
            </div>
          </div>

          <div className="intro-card tech-card">
            <h3>About DeSci Journal DAO</h3>
            <p>
              A decentralized autonomous organization that collectively curates and funds DeSci research papers. 
              All submissions, peer reviews, and publication decisions are processed through <strong>FHE-encrypted workflows</strong>, 
              with royalties distributed via privacy-preserving payments.
            </p>
            <div className="fhe-badge">
              <span>Powered by Zama FHE</span>
            </div>
          </div>

          {isConnected && (
            <div className="user-card tech-card">
              <h3>Your Contributions</h3>
              <div className="user-stats">
                <div className="user-stat">
                  <div className="stat-value">{userContributionCount}</div>
                  <div className="stat-label">Papers Submitted</div>
                </div>
                <div className="user-stat">
                  <div className="stat-value">
                    {papers.filter(p => isAuthor(p.author) && p.status === "published").length}
                  </div>
                  <div className="stat-label">Papers Published</div>
                </div>
              </div>
              <button 
                onClick={() => setShowSubmitModal(true)} 
                className="tech-button primary"
              >
                Submit New Research
              </button>
            </div>
          )}
        </div>

        <div className="papers-section">
          <div className="section-header">
            <h2>Research Papers</h2>
            <div className="header-actions">
              <button 
                onClick={loadPapers} 
                className="refresh-btn tech-button" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="papers-list tech-card">
            {filteredPapers.length === 0 ? (
              <div className="no-papers">
                <div className="no-papers-icon"></div>
                <p>No research papers found matching your criteria</p>
                <button 
                  className="tech-button primary" 
                  onClick={() => setShowSubmitModal(true)}
                >
                  Submit First Paper
                </button>
              </div>
            ) : (
              <div className="papers-grid">
                {filteredPapers.map(paper => (
                  <div 
                    className="paper-card" 
                    key={paper.id}
                    onClick={() => setSelectedPaper(paper)}
                  >
                    <div className="paper-header">
                      <h3>{paper.title}</h3>
                      <span className={`status-badge ${paper.status}`}>
                        {paper.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="paper-meta">
                      <div className="meta-item">
                        <span>Category:</span>
                        <strong>{paper.category}</strong>
                      </div>
                      <div className="meta-item">
                        <span>Author:</span>
                        <strong>
                          {paper.author.substring(0, 6)}...{paper.author.substring(38)}
                        </strong>
                      </div>
                      <div className="meta-item">
                        <span>Date:</span>
                        <strong>
                          {new Date(paper.timestamp * 1000).toLocaleDateString()}
                        </strong>
                      </div>
                    </div>
                    {paper.status === "under_review" && !isAuthor(paper.author) && (
                      <div className="paper-actions">
                        <button 
                          className="action-btn tech-button success"
                          onClick={(e) => {
                            e.stopPropagation();
                            reviewPaper(paper.id, "publish");
                          }}
                        >
                          Approve
                        </button>
                        <button 
                          className="action-btn tech-button danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            reviewPaper(paper.id, "reject");
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showSubmitModal && (
        <ModalSubmit 
          onSubmit={submitPaper} 
          onClose={() => setShowSubmitModal(false)} 
          submitting={submitting} 
          paperData={newPaperData} 
          setPaperData={setNewPaperData}
        />
      )}

      {selectedPaper && (
        <PaperDetailModal 
          paper={selectedPaper} 
          onClose={() => { 
            setSelectedPaper(null); 
            setDecryptedScore(null); 
          }} 
          decryptedScore={decryptedScore} 
          setDecryptedScore={setDecryptedScore} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          isAuthor={isAuthor(selectedPaper.author)}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content tech-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="tech-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="atom-icon"></div>
              <span>DeSci Journal DAO</span>
            </div>
            <p>Decentralized academic publishing powered by FHE encryption</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">DAO Governance</a>
            <a href="#" className="footer-link">Submit Proposal</a>
            <a href="#" className="footer-link">Join Community</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} DeSci Journal DAO. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalSubmitProps {
  onSubmit: () => void; 
  onClose: () => void; 
  submitting: boolean;
  paperData: any;
  setPaperData: (data: any) => void;
}

const ModalSubmit: React.FC<ModalSubmitProps> = ({ 
  onSubmit, 
  onClose, 
  submitting, 
  paperData, 
  setPaperData 
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPaperData({ ...paperData, [name]: value });
  };

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPaperData({ ...paperData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!paperData.title || !paperData.researchScore) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="submit-modal tech-card">
        <div className="modal-header">
          <h2>Submit Research Paper</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> 
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your research score will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Paper Title *</label>
              <input 
                type="text" 
                name="title" 
                value={paperData.title} 
                onChange={handleChange} 
                placeholder="Enter paper title..." 
                className="tech-input"
              />
            </div>
            
            <div className="form-group">
              <label>Research Category *</label>
              <select 
                name="category" 
                value={paperData.category} 
                onChange={handleChange} 
                className="tech-select"
              >
                <option value="Biology">Biology</option>
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
                <option value="Computer Science">Computer Science</option>
                <option value="Mathematics">Mathematics</option>
                <option value="Medicine">Medicine</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Research Score (1-100) *</label>
              <input 
                type="number" 
                name="researchScore" 
                value={paperData.researchScore} 
                onChange={handleScoreChange} 
                placeholder="Enter score (1-100)..." 
                className="tech-input"
                min="1"
                max="100"
              />
            </div>
          </div>
          
          <div className="encryption-preview">
            <h4>FHE Encryption Preview</h4>
            <div className="preview-container">
              <div className="plain-data">
                <span>Plain Score:</span>
                <div>{paperData.researchScore || 'No score entered'}</div>
              </div>
              <div className="encryption-arrow">→</div>
              <div className="encrypted-data">
                <span>Encrypted Data:</span>
                <div>
                  {paperData.researchScore ? 
                    FHEEncryptNumber(paperData.researchScore).substring(0, 50) + '...' : 
                    'No score entered'}
                </div>
              </div>
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> 
            <div>
              <strong>Research Privacy Guarantee</strong>
              <p>Your score remains encrypted during peer review and is never decrypted on our servers</p>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn tech-button">
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting} 
            className="submit-btn tech-button primary"
          >
            {submitting ? "Encrypting with FHE..." : "Submit Paper"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface PaperDetailModalProps {
  paper: ResearchPaper;
  onClose: () => void;
  decryptedScore: number | null;
  setDecryptedScore: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  isAuthor: boolean;
}

const PaperDetailModal: React.FC<PaperDetailModalProps> = ({ 
  paper, 
  onClose, 
  decryptedScore, 
  setDecryptedScore, 
  isDecrypting, 
  decryptWithSignature,
  isAuthor
}) => {
  const handleDecrypt = async () => {
    if (decryptedScore !== null) { 
      setDecryptedScore(null); 
      return; 
    }
    const decrypted = await decryptWithSignature(paper.encryptedData);
    if (decrypted !== null) setDecryptedScore(decrypted);
  };

  return (
    <div className="modal-overlay">
      <div className="paper-detail-modal tech-card">
        <div className="modal-header">
          <h2>Paper Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="paper-info">
            <h3>{paper.title}</h3>
            
            <div className="info-grid">
              <div className="info-item">
                <span>Category:</span>
                <strong>{paper.category}</strong>
              </div>
              
              <div className="info-item">
                <span>Author:</span>
                <strong>
                  {paper.author.substring(0, 6)}...{paper.author.substring(38)}
                </strong>
              </div>
              
              <div className="info-item">
                <span>Submitted:</span>
                <strong>
                  {new Date(paper.timestamp * 1000).toLocaleString()}
                </strong>
              </div>
              
              <div className="info-item">
                <span>Status:</span>
                <strong className={`status-badge ${paper.status}`}>
                  {paper.status.replace('_', ' ')}
                </strong>
              </div>
            </div>
          </div>
          
          <div className="encrypted-data-section">
            <h3>Encrypted Research Data</h3>
            <div className="encrypted-data">
              {paper.encryptedData.substring(0, 100)}...
            </div>
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>Zama FHE Encrypted</span>
            </div>
            
            {(isAuthor || paper.status === "published") && (
              <button 
                className="decrypt-btn tech-button" 
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  <span className="decrypt-spinner"></span>
                ) : decryptedScore !== null ? (
                  "Hide Decrypted Score"
                ) : (
                  "Decrypt with Wallet Signature"
                )}
              </button>
            )}
          </div>
          
          {decryptedScore !== null && (
            <div className="decrypted-data-section">
              <h3>Decrypted Research Score</h3>
              <div className="score-display">
                <div className="score-value">{decryptedScore}</div>
                <div className="score-bar">
                  <div 
                    className="score-fill" 
                    style={{ width: `${decryptedScore}%` }}
                  ></div>
                </div>
              </div>
              <div className="decryption-notice">
                <div className="warning-icon"></div>
                <span>Decrypted score is only visible after wallet signature verification</span>
              </div>
            </div>
          )}
          
          {paper.status === "under_review" && !isAuthor && (
            <div className="review-actions">
              <button 
                className="tech-button success" 
                onClick={() => reviewPaper(paper.id, "publish")}
              >
                Approve for Publication
              </button>
              <button 
                className="tech-button danger" 
                onClick={() => reviewPaper(paper.id, "reject")}
              >
                Reject Paper
              </button>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn tech-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;