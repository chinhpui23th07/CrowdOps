// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {CampaignToken} from "./CampaignToken.sol";
import {CampaignTokenFactory} from "./CampaignTokenFactory.sol";
import {DiamondNFT} from "./DiamondNFT.sol";

/// @title CrowdOps - nền tảng crowdfunding phi tập trung có giải ngân theo biểu quyết
/// @notice Vòng đời chiến dịch:
///   Fundraising --(sau hạn chót, đạt mục tiêu)--> Successful --(giải ngân lần đầu)--> Active
///   Fundraising --(sau hạn chót, không đạt)----> Failed  (người ủng hộ tự rút lại tiền)
///  Successful/Active --(người góp biểu quyết giải thể > 50%)--> Dissolved (rút phần còn lại theo tỷ lệ token)
///  ETH luôn nằm trong contract này; chủ dự án chỉ chuyển được tiền qua yêu cầu chi
///  đã được > 50% TỔNG quyền biểu quyết (tại block snapshot) chấp thuận.
contract CrowdOps is ReentrancyGuard {
    // ------------------------------------------------------------------
    // Kiểu dữ liệu
    // ------------------------------------------------------------------

    enum CampaignState {
        Fundraising, // 0 - Huy động
        Successful, //  1 - Thành công (chưa giải ngân lần nào)
        Failed, //      2 - Thất bại (được hoàn tiền)
        Active, //      3 - Đang triển khai (đã giải ngân ít nhất 1 lần)
        Dissolved //    4 - Đã giải thể theo biểu quyết, người giữ token rút phần còn lại
    }

    enum RequestStatus {
        Voting, //    0 - đang bỏ phiếu
        Approved, //  1 - đã đủ > 50% phiếu thuận, chờ chủ dự án giải ngân
        Rejected, //  2 - bị bác bỏ (hết hạn chưa đủ phiếu, hoặc phiếu chống đã chặn được)
        Executed, //  3 - đã giải ngân
        Cancelled //  4 - chủ dự án tự hủy
    }

    enum Vote {
        None,
        Approve,
        Reject
    }

    /// @dev Tham số tạo chiến dịch gom vào struct để tránh lỗi "stack too deep".
    struct CampaignInput {
        string title;
        string description;
        uint256 goal; //             wei
        uint256 durationSeconds; //  thời gian huy động kể từ lúc tạo
        uint256 diamondThreshold; // tổng số wei tối thiểu một ví phải góp để nhận NFT Kim cương
        string proposalCID; //       PDF proposal trên IPFS (bắt buộc)
        string mediaCID; //          ảnh/video giới thiệu (tùy chọn)
        string nftMetadataCID; //    JSON metadata của NFT Kim cương (bắt buộc)
    }

    struct RequestInput {
        string description;
        address payable recipient; // ví nhận tiền (nhà cung cấp hoặc chính chủ dự án)
        uint256 amount; //            wei
        string evidenceCID; //        hóa đơn/chứng từ trên IPFS (bắt buộc)
        uint256 votingDurationSeconds;
    }

    struct Campaign {
        address creator;
        CampaignToken token;
        CampaignState state;
        uint64 createdAt;
        uint64 deadline;
        uint256 goal;
        uint256 diamondThreshold;
        uint256 totalRaised;
        uint256 totalDisbursed;
        uint256 totalRefunded;
        uint256 backerCount;
        string title;
        string description;
        string proposalCID;
        string mediaCID;
        string nftMetadataCID;
    }

    struct SpendingRequest {
        string description;
        address payable recipient;
        uint256 amount;
        string evidenceCID; //       hóa đơn / chứng từ trên IPFS
        uint64 createdAt;
        uint64 votingDeadline;
        uint256 snapshotBlock; //    quyền biểu quyết được đọc tại block này
        uint256 totalVotingPower; // tổng cung token tại snapshotBlock (mẫu số của ngưỡng 50%)
        uint256 approveVotes;
        uint256 rejectVotes;
        uint256 approveCount; //     số ví bỏ phiếu thuận
        uint256 rejectCount; //      số ví bỏ phiếu chống
        bool executed;
        bool cancelled;
    }

    /// @notice Đề xuất giải thể quỹ: người giữ token yêu cầu dừng dự án (chủ dự án bỏ đi,
    ///  làm sai cam kết...) và chia lại số ETH còn trong quỹ theo tỷ lệ token.
    struct DissolutionProposal {
        address proposer;
        string reason;
        uint64 createdAt;
        uint64 votingDeadline;
        uint256 snapshotBlock;
        uint256 totalVotingPower;
        uint256 supportVotes;
        uint256 opposeVotes;
        uint256 supportCount;
        uint256 opposeCount;
    }

    struct Document {
        string label;
        string cid;
        bool encrypted; // true = file đã mã hóa AES-GCM trước khi upload, cần xin khóa để xem
        uint64 addedAt;
    }

    // ------------------------------------------------------------------
    // Hằng số
    // ------------------------------------------------------------------

    uint256 public constant MIN_CAMPAIGN_DURATION = 60; // 1 phút - đủ ngắn để demo trên testnet
    uint256 public constant MAX_CAMPAIGN_DURATION = 90 days;
    uint256 public constant MIN_VOTING_DURATION = 60;
    uint256 public constant MAX_VOTING_DURATION = 30 days;

    // ------------------------------------------------------------------
    // Lưu trữ
    // ------------------------------------------------------------------

    DiamondNFT public immutable diamondNFT;
    CampaignTokenFactory public immutable tokenFactory;
    uint256 public campaignCount;

    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => SpendingRequest[]) private _requests;
    mapping(uint256 => Document[]) private _documents;
    mapping(uint256 => DissolutionProposal[]) private _dissolutions;

    /// @notice campaignId => ví => tổng wei đã góp (giữ nguyên cả sau khi hoàn tiền để làm lịch sử)
    mapping(uint256 => mapping(address => uint256)) public contributions;
    /// @notice campaignId => ví => đã nhận hoàn tiền chưa
    mapping(uint256 => mapping(address => bool)) public hasRefunded;
    /// @notice campaignId => requestId => ví => phiếu đã bỏ
    mapping(uint256 => mapping(uint256 => mapping(address => Vote))) public votes;
    /// @notice campaignId => ví => đã nhận NFT Kim cương chưa
    mapping(uint256 => mapping(address => bool)) public diamondClaimed;
    /// @notice campaignId => proposalId => ví => phiếu đã bỏ cho đề xuất giải thể
    mapping(uint256 => mapping(uint256 => mapping(address => Vote))) public dissolutionVotes;

    // ------------------------------------------------------------------
    // Sự kiện
    // ------------------------------------------------------------------

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        address token,
        uint256 goal,
        uint256 deadline,
        string title
    );
    event Contributed(uint256 indexed campaignId, address indexed backer, uint256 amount, uint256 totalRaised);
    event CampaignFinalized(uint256 indexed campaignId, CampaignState state, uint256 totalRaised);
    event Refunded(uint256 indexed campaignId, address indexed backer, uint256 amount);
    event SpendingRequested(
        uint256 indexed campaignId,
        uint256 indexed requestId,
        address recipient,
        uint256 amount,
        uint256 votingDeadline,
        uint256 snapshotBlock,
        uint256 totalVotingPower
    );
    event Voted(
        uint256 indexed campaignId, uint256 indexed requestId, address indexed voter, bool approve, uint256 weight
    );
    event SpendingExecuted(uint256 indexed campaignId, uint256 indexed requestId, address recipient, uint256 amount);
    event RequestCancelled(uint256 indexed campaignId, uint256 indexed requestId);
    event DocumentAdded(uint256 indexed campaignId, uint256 indexed documentId, string label, string cid, bool encrypted);
    event DiamondClaimed(uint256 indexed campaignId, address indexed backer, uint256 tokenId);
    event DissolutionProposed(
        uint256 indexed campaignId,
        uint256 indexed proposalId,
        address indexed proposer,
        uint256 votingDeadline,
        uint256 snapshotBlock,
        uint256 totalVotingPower
    );
    event DissolutionVoted(
        uint256 indexed campaignId, uint256 indexed proposalId, address indexed voter, bool support, uint256 weight
    );
    event CampaignDissolved(uint256 indexed campaignId, uint256 indexed proposalId, uint256 remainingBalance);
    event DissolutionRefunded(uint256 indexed campaignId, address indexed holder, uint256 tokensBurned, uint256 amount);

    // ------------------------------------------------------------------
    // Lỗi
    // ------------------------------------------------------------------

    error CampaignNotFound();
    error RequestNotFound();
    error InvalidInput(string reason);
    error NotCreator();
    error CreatorCannotParticipate();
    error WrongState(CampaignState current);
    error DeadlinePassed();
    error DeadlineNotReached();
    error ZeroContribution();
    error NothingToRefund();
    error AlreadyRefunded();
    error OpenRequestExists();
    error OpenProposalExists();
    error ProposalNotFound();
    error AmountExceedsBalance(uint256 requested, uint256 available);
    error VotingClosed();
    error AlreadyVoted();
    error NoVotingPower();
    error RequestNotApproved(RequestStatus status);
    error RequestNotOpen(RequestStatus status);
    error NotDiamondBacker(uint256 contributed, uint256 threshold);
    error DiamondAlreadyClaimed();
    error TransferFailed();
    error DirectPaymentNotAllowed();

    // ------------------------------------------------------------------
    // Modifier
    // ------------------------------------------------------------------

    modifier campaignExists(uint256 campaignId) {
        if (campaignId == 0 || campaignId > campaignCount) revert CampaignNotFound();
        _;
    }

    modifier onlyCreator(uint256 campaignId) {
        if (msg.sender != _campaigns[campaignId].creator) revert NotCreator();
        _;
    }

    constructor() {
        diamondNFT = new DiamondNFT();
        tokenFactory = new CampaignTokenFactory();
    }

    /// @dev Không nhận ETH gửi thẳng: mọi khoản góp phải gắn với một chiến dịch qua contribute().
    receive() external payable {
        revert DirectPaymentNotAllowed();
    }

    // ------------------------------------------------------------------
    // Chiến dịch
    // ------------------------------------------------------------------

    function createCampaign(CampaignInput calldata input) external returns (uint256 campaignId) {
        if (bytes(input.title).length == 0) revert InvalidInput("title");
        if (input.goal == 0) revert InvalidInput("goal");
        if (input.durationSeconds < MIN_CAMPAIGN_DURATION || input.durationSeconds > MAX_CAMPAIGN_DURATION) {
            revert InvalidInput("duration");
        }
        if (input.diamondThreshold == 0 || input.diamondThreshold > input.goal) revert InvalidInput("diamondThreshold");
        if (bytes(input.proposalCID).length == 0) revert InvalidInput("proposalCID");
        if (bytes(input.nftMetadataCID).length == 0) revert InvalidInput("nftMetadataCID");

        campaignId = ++campaignCount;
        string memory idText = Strings.toString(campaignId);
        CampaignToken token = tokenFactory.deploy(
            string.concat("Crowd Ops Campaign #", idText), string.concat("COP", idText), campaignId
        );

        Campaign storage c = _campaigns[campaignId];
        c.creator = msg.sender;
        c.token = token;
        c.state = CampaignState.Fundraising;
        c.createdAt = uint64(block.timestamp);
        c.deadline = uint64(block.timestamp + input.durationSeconds);
        c.goal = input.goal;
        c.diamondThreshold = input.diamondThreshold;
        c.title = input.title;
        c.description = input.description;
        c.proposalCID = input.proposalCID;
        c.mediaCID = input.mediaCID;
        c.nftMetadataCID = input.nftMetadataCID;

        emit CampaignCreated(campaignId, msg.sender, address(token), input.goal, c.deadline, input.title);
    }

    /// @notice Góp ETH. Được góp vượt mục tiêu cho tới hạn chót (deadline tính cả giây cuối).
    function contribute(uint256 campaignId) external payable campaignExists(campaignId) nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        if (c.state != CampaignState.Fundraising) revert WrongState(c.state);
        if (block.timestamp > c.deadline) revert DeadlinePassed();
        if (msg.value == 0) revert ZeroContribution();
        // Chủ dự án không được tự góp để tự cấp quyền biểu quyết cho mình.
        if (msg.sender == c.creator) revert CreatorCannotParticipate();

        if (contributions[campaignId][msg.sender] == 0) c.backerCount += 1;
        contributions[campaignId][msg.sender] += msg.value;
        c.totalRaised += msg.value;

        // 1 wei = 1 đơn vị token quản trị của riêng chiến dịch này.
        c.token.mint(msg.sender, msg.value);
        emit Contributed(campaignId, msg.sender, msg.value, c.totalRaised);
    }

    /// @notice Chốt kết quả sau hạn chót. Ai cũng gọi được (thường là frontend của người dùng đầu tiên).
    function finalize(uint256 campaignId) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        if (c.state != CampaignState.Fundraising) revert WrongState(c.state);
        if (block.timestamp <= c.deadline) revert DeadlineNotReached();

        if (c.totalRaised >= c.goal) {
            c.state = CampaignState.Successful;
            c.token.enableTransfers();
        } else {
            c.state = CampaignState.Failed;
        }
        emit CampaignFinalized(campaignId, c.state, c.totalRaised);
    }

    /// @notice Hoàn đúng số ETH đã góp khi chiến dịch thất bại. Mỗi ví chỉ nhận một lần.
    function refund(uint256 campaignId) external campaignExists(campaignId) nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        if (c.state != CampaignState.Failed) revert WrongState(c.state);
        if (hasRefunded[campaignId][msg.sender]) revert AlreadyRefunded();
        uint256 amount = contributions[campaignId][msg.sender];
        if (amount == 0) revert NothingToRefund();

        // Checks-Effects-Interactions: cập nhật trạng thái TRƯỚC khi chuyển ETH.
        hasRefunded[campaignId][msg.sender] = true;
        c.totalRefunded += amount;
        // Token không chuyển nhượng được khi Thất bại nên số dư token luôn bằng số wei đã góp.
        c.token.burn(msg.sender, amount);

        emit Refunded(campaignId, msg.sender, amount);
        _sendEth(payable(msg.sender), amount);
    }

    // ------------------------------------------------------------------
    // Yêu cầu chi tiêu & biểu quyết
    // ------------------------------------------------------------------

    function requestSpending(uint256 campaignId, RequestInput calldata input)
        external
        campaignExists(campaignId)
        onlyCreator(campaignId)
        returns (uint256 requestId)
    {
        Campaign storage c = _campaigns[campaignId];
        if (c.state != CampaignState.Successful && c.state != CampaignState.Active) revert WrongState(c.state);
        if (hasOpenRequest(campaignId)) revert OpenRequestExists();
        if (bytes(input.description).length == 0) revert InvalidInput("description");
        if (input.recipient == address(0)) revert InvalidInput("recipient");
        if (bytes(input.evidenceCID).length == 0) revert InvalidInput("evidenceCID");
        if (input.votingDurationSeconds < MIN_VOTING_DURATION || input.votingDurationSeconds > MAX_VOTING_DURATION) {
            revert InvalidInput("votingDuration");
        }
        if (input.amount == 0) revert InvalidInput("amount");
        uint256 available = availableBalance(campaignId);
        if (input.amount > available) revert AmountExceedsBalance(input.amount, available);

        requestId = _requests[campaignId].length;
        SpendingRequest storage r = _requests[campaignId].push();
        r.description = input.description;
        r.recipient = input.recipient;
        r.amount = input.amount;
        r.evidenceCID = input.evidenceCID;
        r.createdAt = uint64(block.timestamp);
        r.votingDeadline = uint64(block.timestamp + input.votingDurationSeconds);
        // Snapshot ở block trước đó: mọi chuyển nhượng token từ block này trở đi
        // không ảnh hưởng tới quyền biểu quyết của yêu cầu này.
        r.snapshotBlock = block.number - 1;
        r.totalVotingPower = c.token.getPastTotalSupply(r.snapshotBlock);

        emit SpendingRequested(
            campaignId, requestId, input.recipient, input.amount, r.votingDeadline, r.snapshotBlock, r.totalVotingPower
        );
    }

    function approveRequest(uint256 campaignId, uint256 requestId) external {
        _castVote(campaignId, requestId, true);
    }

    function rejectRequest(uint256 campaignId, uint256 requestId) external {
        _castVote(campaignId, requestId, false);
    }

    /// @notice Giải ngân yêu cầu đã được duyệt. Có thể gọi ngay khi phiếu thuận vượt 50%,
    ///  vì phiếu không đổi được nên kết quả đã chắc chắn.
    function executeSpending(uint256 campaignId, uint256 requestId)
        external
        campaignExists(campaignId)
        onlyCreator(campaignId)
        nonReentrant
    {
        Campaign storage c = _campaigns[campaignId];
        // Quỹ đã giải thể thì yêu cầu đã duyệt trước đó cũng không được giải ngân nữa.
        if (c.state != CampaignState.Successful && c.state != CampaignState.Active) revert WrongState(c.state);
        SpendingRequest storage r = _getRequest(campaignId, requestId);
        RequestStatus status = _statusOf(r);
        if (status != RequestStatus.Approved) revert RequestNotApproved(status);
        uint256 available = availableBalance(campaignId);
        if (r.amount > available) revert AmountExceedsBalance(r.amount, available);

        r.executed = true;
        c.totalDisbursed += r.amount;
        if (c.state == CampaignState.Successful) c.state = CampaignState.Active;

        emit SpendingExecuted(campaignId, requestId, r.recipient, r.amount);
        _sendEth(r.recipient, r.amount);
    }

    /// @notice Chủ dự án rút lại yêu cầu chưa giải ngân (ví dụ nhập sai) để tạo yêu cầu mới.
    function cancelRequest(uint256 campaignId, uint256 requestId)
        external
        campaignExists(campaignId)
        onlyCreator(campaignId)
    {
        SpendingRequest storage r = _getRequest(campaignId, requestId);
        RequestStatus status = _statusOf(r);
        if (status != RequestStatus.Voting && status != RequestStatus.Approved) revert RequestNotOpen(status);
        r.cancelled = true;
        emit RequestCancelled(campaignId, requestId);
    }

    // ------------------------------------------------------------------
    // Giải thể quỹ (bảo vệ người góp khi chủ dự án bỏ đi)
    // ------------------------------------------------------------------

    /// @notice Người đang giữ token đề xuất giải thể quỹ. Mỗi chiến dịch chỉ có một đề xuất mở.
    function proposeDissolution(uint256 campaignId, string calldata reason, uint256 votingDurationSeconds)
        external
        campaignExists(campaignId)
        returns (uint256 proposalId)
    {
        Campaign storage c = _campaigns[campaignId];
        if (c.state != CampaignState.Successful && c.state != CampaignState.Active) revert WrongState(c.state);
        if (msg.sender == c.creator) revert CreatorCannotParticipate();
        if (c.token.getVotes(msg.sender) == 0) revert NoVotingPower();
        if (bytes(reason).length == 0) revert InvalidInput("reason");
        if (votingDurationSeconds < MIN_VOTING_DURATION || votingDurationSeconds > MAX_VOTING_DURATION) {
            revert InvalidInput("votingDuration");
        }
        uint256 count = _dissolutions[campaignId].length;
        if (count > 0 && _dissolutionStatusOf(_dissolutions[campaignId][count - 1]) == RequestStatus.Voting) {
            revert OpenProposalExists();
        }

        proposalId = count;
        DissolutionProposal storage p = _dissolutions[campaignId].push();
        p.proposer = msg.sender;
        p.reason = reason;
        p.createdAt = uint64(block.timestamp);
        p.votingDeadline = uint64(block.timestamp + votingDurationSeconds);
        // Cùng cơ chế snapshot với yêu cầu chi: chuyển token sau mốc này không tạo thêm phiếu.
        p.snapshotBlock = block.number - 1;
        p.totalVotingPower = c.token.getPastTotalSupply(p.snapshotBlock);

        emit DissolutionProposed(campaignId, proposalId, msg.sender, p.votingDeadline, p.snapshotBlock, p.totalVotingPower);
    }

    /// @notice Bỏ phiếu cho đề xuất giải thể. Phiếu ủng hộ vượt 50% TỔNG quyền thì quỹ giải thể ngay.
    function voteDissolution(uint256 campaignId, uint256 proposalId, bool support) external campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        if (msg.sender == c.creator) revert CreatorCannotParticipate();
        if (c.state != CampaignState.Successful && c.state != CampaignState.Active) revert WrongState(c.state);
        DissolutionProposal storage p = _getDissolution(campaignId, proposalId);
        if (_dissolutionStatusOf(p) != RequestStatus.Voting) revert VotingClosed();
        if (dissolutionVotes[campaignId][proposalId][msg.sender] != Vote.None) revert AlreadyVoted();

        uint256 weight = c.token.getPastVotes(msg.sender, p.snapshotBlock);
        if (weight == 0) revert NoVotingPower();

        if (support) {
            dissolutionVotes[campaignId][proposalId][msg.sender] = Vote.Approve;
            p.supportVotes += weight;
            p.supportCount += 1;
        } else {
            dissolutionVotes[campaignId][proposalId][msg.sender] = Vote.Reject;
            p.opposeVotes += weight;
            p.opposeCount += 1;
        }
        emit DissolutionVoted(campaignId, proposalId, msg.sender, support, weight);

        if (_dissolutionStatusOf(p) == RequestStatus.Approved) {
            c.state = CampaignState.Dissolved;
            emit CampaignDissolved(campaignId, proposalId, availableBalance(campaignId));
        }
    }

    /// @notice Sau khi giải thể, người giữ token đổi token lấy phần ETH còn lại theo tỷ lệ:
    ///  nhận = số dư quỹ * token của bạn / tổng token đang lưu hành. Token bị burn nên
    ///  không thể rút hai lần; người rút cuối cùng nhận đúng phần còn lại (không sót wei).
    function claimDissolutionRefund(uint256 campaignId) external campaignExists(campaignId) nonReentrant {
        Campaign storage c = _campaigns[campaignId];
        if (c.state != CampaignState.Dissolved) revert WrongState(c.state);
        uint256 tokens = c.token.balanceOf(msg.sender);
        if (tokens == 0) revert NothingToRefund();

        uint256 amount = availableBalance(campaignId) * tokens / c.token.totalSupply();
        // Checks-Effects-Interactions: burn token và ghi sổ TRƯỚC khi chuyển ETH.
        c.totalRefunded += amount;
        c.token.burn(msg.sender, tokens);

        emit DissolutionRefunded(campaignId, msg.sender, tokens, amount);
        _sendEth(payable(msg.sender), amount);
    }

    // ------------------------------------------------------------------
    // Tài liệu & NFT
    // ------------------------------------------------------------------

    /// @notice Gắn thêm tài liệu IPFS (báo cáo tiến độ, tài liệu riêng đã mã hóa...).
    function addDocument(uint256 campaignId, string calldata label, string calldata cid, bool encrypted)
        external
        campaignExists(campaignId)
        onlyCreator(campaignId)
    {
        if (bytes(label).length == 0) revert InvalidInput("label");
        if (bytes(cid).length == 0) revert InvalidInput("cid");
        uint256 documentId = _documents[campaignId].length;
        _documents[campaignId].push(Document(label, cid, encrypted, uint64(block.timestamp)));
        emit DocumentAdded(campaignId, documentId, label, cid, encrypted);
    }

    /// @notice Người ủng hộ Kim cương (tổng góp >= diamondThreshold) nhận 1 NFT tri ân
    ///  sau khi chiến dịch thành công. Chiến dịch thất bại thì không có NFT.
    function claimDiamondNFT(uint256 campaignId) external campaignExists(campaignId) nonReentrant returns (uint256) {
        Campaign storage c = _campaigns[campaignId];
        if (c.state != CampaignState.Successful && c.state != CampaignState.Active) revert WrongState(c.state);
        uint256 contributed = contributions[campaignId][msg.sender];
        if (contributed < c.diamondThreshold) revert NotDiamondBacker(contributed, c.diamondThreshold);
        if (diamondClaimed[campaignId][msg.sender]) revert DiamondAlreadyClaimed();

        diamondClaimed[campaignId][msg.sender] = true;
        uint256 tokenId = diamondNFT.mint(msg.sender, campaignId, c.nftMetadataCID);
        emit DiamondClaimed(campaignId, msg.sender, tokenId);
        return tokenId;
    }

    // ------------------------------------------------------------------
    // Hàm đọc (view) - miễn phí, không cần ký ví
    // ------------------------------------------------------------------

    function getCampaign(uint256 campaignId) external view campaignExists(campaignId) returns (Campaign memory) {
        return _campaigns[campaignId];
    }

    function getRequestCount(uint256 campaignId) external view returns (uint256) {
        return _requests[campaignId].length;
    }

    function getRequest(uint256 campaignId, uint256 requestId)
        external
        view
        returns (SpendingRequest memory request, RequestStatus status)
    {
        SpendingRequest storage r = _getRequest(campaignId, requestId);
        return (r, _statusOf(r));
    }

    function getRequestStatus(uint256 campaignId, uint256 requestId) external view returns (RequestStatus) {
        return _statusOf(_getRequest(campaignId, requestId));
    }

    function getDissolutionCount(uint256 campaignId) external view returns (uint256) {
        return _dissolutions[campaignId].length;
    }

    /// @notice status dùng chung enum với yêu cầu chi: Voting / Approved (đã thông qua) / Rejected.
    function getDissolution(uint256 campaignId, uint256 proposalId)
        external
        view
        returns (DissolutionProposal memory proposal, RequestStatus status)
    {
        DissolutionProposal storage p = _getDissolution(campaignId, proposalId);
        return (p, _dissolutionStatusOf(p));
    }

    function dissolutionVotingPowerFor(uint256 campaignId, uint256 proposalId, address voter)
        external
        view
        returns (uint256)
    {
        DissolutionProposal storage p = _getDissolution(campaignId, proposalId);
        return _campaigns[campaignId].token.getPastVotes(voter, p.snapshotBlock);
    }

    function getDocuments(uint256 campaignId) external view returns (Document[] memory) {
        return _documents[campaignId];
    }

    /// @notice Quyền biểu quyết của một ví cho một yêu cầu (đọc tại snapshot).
    function votingPowerFor(uint256 campaignId, uint256 requestId, address voter) external view returns (uint256) {
        SpendingRequest storage r = _getRequest(campaignId, requestId);
        return _campaigns[campaignId].token.getPastVotes(voter, r.snapshotBlock);
    }

    /// @notice Số ETH còn trong quỹ của chiến dịch (chưa giải ngân / chưa hoàn).
    function availableBalance(uint256 campaignId) public view returns (uint256) {
        Campaign storage c = _campaigns[campaignId];
        return c.totalRaised - c.totalDisbursed - c.totalRefunded;
    }

    /// @notice Yêu cầu được tạo tuần tự nên chỉ yêu cầu cuối cùng có thể còn mở.
    function hasOpenRequest(uint256 campaignId) public view returns (bool) {
        uint256 count = _requests[campaignId].length;
        if (count == 0) return false;
        RequestStatus status = _statusOf(_requests[campaignId][count - 1]);
        return status == RequestStatus.Voting || status == RequestStatus.Approved;
    }

    function isDiamondEligible(uint256 campaignId, address backer) external view returns (bool) {
        return contributions[campaignId][backer] >= _campaigns[campaignId].diamondThreshold
            && _campaigns[campaignId].diamondThreshold > 0;
    }

    // ------------------------------------------------------------------
    // Nội bộ
    // ------------------------------------------------------------------

    function _castVote(uint256 campaignId, uint256 requestId, bool approve) internal campaignExists(campaignId) {
        Campaign storage c = _campaigns[campaignId];
        if (msg.sender == c.creator) revert CreatorCannotParticipate();
        SpendingRequest storage r = _getRequest(campaignId, requestId);
        if (_statusOf(r) != RequestStatus.Voting) revert VotingClosed();
        if (votes[campaignId][requestId][msg.sender] != Vote.None) revert AlreadyVoted();

        // Đọc phiếu tại snapshot => nhận token sau snapshot không có thêm phiếu.
        uint256 weight = c.token.getPastVotes(msg.sender, r.snapshotBlock);
        if (weight == 0) revert NoVotingPower();

        if (approve) {
            votes[campaignId][requestId][msg.sender] = Vote.Approve;
            r.approveVotes += weight;
            r.approveCount += 1;
        } else {
            votes[campaignId][requestId][msg.sender] = Vote.Reject;
            r.rejectVotes += weight;
            r.rejectCount += 1;
        }
        emit Voted(campaignId, requestId, msg.sender, approve, weight);
    }

    /// @dev Ngưỡng duyệt: approveVotes > 50% totalVotingPower (tổng quyền tại snapshot),
    ///  KHÔNG phải 50% số người đã bỏ phiếu. Phiếu chống >= 50% tổng thì phe thuận không
    ///  thể vượt 50% nữa => bác bỏ sớm. Hết hạn mà chưa đủ => bác bỏ.
    function _statusOf(SpendingRequest storage r) internal view returns (RequestStatus) {
        if (r.cancelled) return RequestStatus.Cancelled;
        if (r.executed) return RequestStatus.Executed;
        if (r.approveVotes * 2 > r.totalVotingPower) return RequestStatus.Approved;
        if (r.rejectVotes * 2 >= r.totalVotingPower) return RequestStatus.Rejected;
        if (block.timestamp > r.votingDeadline) return RequestStatus.Rejected;
        return RequestStatus.Voting;
    }

    /// @dev Cùng ngưỡng với yêu cầu chi: ủng hộ > 50% tổng quyền tại snapshot thì thông qua.
    function _dissolutionStatusOf(DissolutionProposal storage p) internal view returns (RequestStatus) {
        if (p.supportVotes * 2 > p.totalVotingPower) return RequestStatus.Approved;
        if (p.opposeVotes * 2 >= p.totalVotingPower) return RequestStatus.Rejected;
        if (block.timestamp > p.votingDeadline) return RequestStatus.Rejected;
        return RequestStatus.Voting;
    }

    function _getDissolution(uint256 campaignId, uint256 proposalId)
        internal
        view
        returns (DissolutionProposal storage)
    {
        if (proposalId >= _dissolutions[campaignId].length) revert ProposalNotFound();
        return _dissolutions[campaignId][proposalId];
    }

    function _getRequest(uint256 campaignId, uint256 requestId) internal view returns (SpendingRequest storage) {
        if (requestId >= _requests[campaignId].length) revert RequestNotFound();
        return _requests[campaignId][requestId];
    }

    function _sendEth(address payable to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
