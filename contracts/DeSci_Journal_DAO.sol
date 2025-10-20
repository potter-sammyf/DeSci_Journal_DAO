pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";


contract DeSciJournalDAOFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct Batch {
        uint256 id;
        bool isOpen;
        uint256 submissionCount;
        uint256 totalScore; // Encrypted sum of scores
    }
    Batch[] public batches;
    mapping(uint256 => Batch) public batchById; // batchId -> Batch
    uint256 public currentBatchId;

    struct Paper {
        uint256 batchId;
        address submitter;
        euint32 encryptedScore; // euint32 representing the paper's score
        uint256 submissionTime;
    }
    Paper[] public papers;
    mapping(uint256 => mapping(uint256 => Paper)) public paperInBatch; // batchId -> paperIndex -> Paper

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool paused);
    event CooldownSecondsUpdated(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event PaperSubmitted(address indexed submitter, uint256 indexed batchId, uint256 paperIndex);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalScore);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier submissionCooldown(address _address) {
        if (block.timestamp < lastSubmissionTime[_address] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier decryptionCooldown(address _address) {
        if (block.timestamp < lastDecryptionRequestTime[_address] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60; // Default cooldown: 1 minute
        currentBatchId = 0;
        // FHE.init() is called implicitly by the SepoliaConfig constructor
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSecondsUpdated(oldCooldownSeconds, _cooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        Batch memory newBatch = Batch({
            id: currentBatchId,
            isOpen: true,
            submissionCount: 0,
            totalScore: euint32(0)
        });
        batches.push(newBatch);
        batchById[currentBatchId] = newBatch;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        Batch storage batch = batchById[batchId];
        if (batch.id == 0 || !batch.isOpen) revert InvalidBatch();
        batch.isOpen = false;
        emit BatchClosed(batchId);
    }

    function submitPaper(uint256 batchId, euint32 encryptedScore) external onlyProvider whenNotPaused submissionCooldown(msg.sender) {
        Batch storage batch = batchById[batchId];
        if (batch.id == 0 || !batch.isOpen) revert BatchNotOpen();

        Paper memory newPaper = Paper({
            batchId: batchId,
            submitter: msg.sender,
            encryptedScore: encryptedScore,
            submissionTime: block.timestamp
        });
        papers.push(newPaper);
        paperInBatch[batchId][batch.submissionCount] = newPaper;

        batch.totalScore = batch.totalScore.add(encryptedScore);
        batch.submissionCount++;

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit PaperSubmitted(msg.sender, batchId, batch.submissionCount - 1);
    }

    function requestBatchScoreDecryption(uint256 batchId) external onlyProvider whenNotPaused decryptionCooldown(msg.sender) {
        Batch storage batch = batchById[batchId];
        if (batch.id == 0) revert InvalidBatch();

        euint32[] memory cts = new euint32[](1);
        cts[0] = batch.totalScore;

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) external {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // Rebuild ciphertexts array in the exact same order as in requestBatchScoreDecryption
        uint256 batchId = decryptionContexts[requestId].batchId;
        Batch storage batch = batchById[batchId]; // Will revert if batchId is invalid

        euint32[] memory cts = new euint32[](1);
        cts[0] = batch.totalScore;

        // State Verification
        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        // Proof Verification
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        // Decode & Finalize
        uint256 totalScore = abi.decode(cleartexts, (uint256));
        decryptionContexts[requestId].processed = true;

        emit DecryptionCompleted(requestId, batchId, totalScore);
    }

    function _hashCiphertexts(euint32[] memory cts) internal pure returns (bytes32) {
        bytes32[] memory ctsAsBytes32 = new bytes32[](cts.length);
        for (uint i = 0; i < cts.length; i++) {
            ctsAsBytes32[i] = FHE.toBytes32(cts[i]);
        }
        return keccak256(abi.encode(ctsAsBytes32, address(this)));
    }

    function _initIfNeeded() internal {
        if (!FHE.isInitialized()) {
            FHE.init();
        }
    }

    function _requireInitialized() internal view {
        if (!FHE.isInitialized()) {
            revert("FHE not initialized");
        }
    }
}