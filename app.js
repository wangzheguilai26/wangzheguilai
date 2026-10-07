const CONTRACT_ADDRESS = 'TXtd1BHbhsPKdVZfBS9HwPPQRebPqGzUK6';
const ROUTER_ADDRESS = 'TNJVzGqKBWkJxJB5XYSqGAwUTV15U24pPq';
const WTRX_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const BURN_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
// 🌟 如果之后部署到公网，请替换为你的服务器地址
const BACKEND_URL = 'http://localhost:3000'; 

let tronWeb, contract, routerContract, userAddress;
let currentSlippage = 0.5;
let pairCheckTimer = null;

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast || !toastMsg) return;
    toastMsg.innerText = message;
    toast.className = `fixed top-5 left-1/2 transform -translate-x-1/2 translate-y-0 px-6 py-3 rounded-full font-semibold shadow-lg transition-all duration-300 z-50 flex items-center gap-2 ${isError ? 'bg-red-500' : 'bg-green-500'}`;
    toast.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> <span>${message}</span>`;
    setTimeout(() => { toast.classList.replace('translate-y-0', 'translate-y-[-100px]'); }, 3000);
}

function formatNumber(num) { 
    if (num === undefined || num === null || isNaN(num)) return '0'; 
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); 
}

// 🌟 兼容所有环境的“最强复制函数”
function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        // 现代浏览器，在 HTTPS 或 localhost 环境下直接使用
        return navigator.clipboard.writeText(text);
    } else {
        // 兼容 file:// 或 http://局域网IP 环境，使用旧版 textarea 方案
        let textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        return new Promise((res, rej) => {
            try {
                document.execCommand('copy') ? res() : rej();
            } catch (e) {
                rej(e);
            }
            textArea.remove();
        });
    }
}

function validateTronAddress(addr) {
    if (!addr) return { ok: false, reason: "地址不能为空" };
    if (addr.startsWith('0x')) return { ok: false, reason: "不支援 0x 开头的以太坊地址" };
    const tronRegex = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
    if (!tronRegex.test(addr)) return { ok: false, reason: "TRON 地址格式不正确（应为 T 开头 34 位）" };
    if (addr === BURN_ADDRESS) return { ok: false, reason: "不能向黑洞地址/零地址转账" };
    if (addr === userAddress) return { ok: false, reason: "不能给自己转账" };
    return { ok: true };
}

function toggleModal(show) {
    const modal = document.getElementById('transferModal');
    if (!modal) return;
    const inner = modal.querySelector('div');
    if (show) { modal.classList.remove('hidden'); setTimeout(() => { modal.classList.remove('opacity-0'); inner.classList.remove('scale-95'); }, 10); }
    else { modal.classList.add('opacity-0'); inner.classList.add('scale-95'); setTimeout(() => { modal.classList.add('hidden'); }, 300); }
}

async function checkPairStatus() {
    if (!routerContract) return;
    const btn = document.getElementById('swapBtn');
    try {
        const pairAddress = await routerContract.getPair(WTRX_ADDRESS, CONTRACT_ADDRESS).call();
        if (!pairAddress || pairAddress === BURN_ADDRESS || pairAddress === '0x0000000000000000000000000000000000000000') {
            disableSwapBtn('池子未开放');
            return;
        }
        const pairContract = await tronWeb.contract().at(pairAddress);
        const reserves = await pairContract.getReserves().call();
        if (reserves[0].toString() === '0' || reserves[1].toString() === '0') {
            disableSwapBtn('池子未开放');
        } else {
            btn.disabled = false;
            btn.innerText = '兑换';
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    } catch (e) {
        disableSwapBtn('池子未开放');
    }
}

function disableSwapBtn(text) {
    const btn = document.getElementById('swapBtn');
    btn.disabled = true;
    btn.innerText = text;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
}

window.addEventListener('load', async () => {
    if (window.tronLink) {
        window.addEventListener('message', (e) => { if (e.data.message && e.data.message.action === "setAccount") checkWallet(); });
    }
    setInterval(async () => {
        if (userAddress && tronWeb) { await checkWallet(); }
    }, 30000);
});

document.getElementById('connectBtn').addEventListener('click', async () => {
    if (!window.tronLink) { showToast('请先安装 TronLink 钱包 App 或插件！', true); return; }
    try {
        const res = await window.tronLink.request({ method: 'tron_requestAccounts' });
        if (res.code === 200) { tronWeb = window.tronLink.tronWeb; await checkWallet(); showToast('钱包连接成功！'); }
    } catch (error) { showToast("连接钱包失败，请检查钱包是否解锁。", true); }
});

async function checkWallet() {
    if (!tronWeb || !tronWeb.defaultAddress.base58) return;
    userAddress = tronWeb.defaultAddress.base58;
    document.getElementById('walletAddress').innerText = userAddress.slice(0, 6) + '...' + userAddress.slice(-4);
    document.getElementById('walletPanel').classList.remove('hidden');
    document.getElementById('connectBtn').classList.add('hidden');

    contract = await tronWeb.contract().at(CONTRACT_ADDRESS);
    routerContract = await tronWeb.contract().at(ROUTER_ADDRESS);
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/balance?address=${userAddress}`);
        const result = await response.json();

        if (result.success && result.data) {
            document.getElementById('walletBalance').innerText = formatNumber(result.data.wzglBalance) + ' WZGL';
            document.getElementById('trxBalance').innerText = formatNumber(result.data.trxBalance) + ' TRX';
        } else {
            document.getElementById('walletBalance').innerText = '-- WZGL';
            document.getElementById('trxBalance').innerText = '-- TRX';
        }
        
        updatePriceInfo();
        checkPairStatus();
        if (pairCheckTimer) clearInterval(pairCheckTimer);
        pairCheckTimer = setInterval(checkPairStatus, 60000);
    } catch (error) { 
        showToast('无法连接后端服务，请检查服务器是否启动！', true);
    }
}

// 🌟 使用最强兼容函数绑定“复制地址”点击事件
document.getElementById('copyAddress').addEventListener('click', () => {
    if (!userAddress) { showToast('请先连接钱包', true); return; }
    copyTextToClipboard(userAddress)
        .then(() => showToast('地址已复制到剪贴板'))
        .catch(() => showToast('复制失败，请手动长按复制', true));
});

async function updatePriceInfo() {
    if (!routerContract) return;
    try {
        const oneTrx = tronWeb.BigNumber(1).times(10 ** 6).toString();
        const path = [WTRX_ADDRESS, CONTRACT_ADDRESS];
        const amounts = await routerContract.getAmountsOut(oneTrx, path).call();
        const price = tronWeb.BigNumber(amounts[1]).div(10 ** 18).toString();
        document.getElementById('priceInfo').innerText = `实时价格：1 TRX ≈ ${parseFloat(price).toFixed(4)} WZGL`;
    } catch (e) {
        document.getElementById('priceInfo').innerText = `实时价格：池子未建立，无法读取`;
    }
}

document.getElementById('slippageBtn').addEventListener('click', () => { document.getElementById('slippagePanel').classList.toggle('hidden'); });
document.querySelectorAll('.slippage-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
        currentSlippage = parseFloat(e.target.getAttribute('data-val'));
        document.getElementById('customSlippage').value = '';
        showToast(`滑点已设置为 ${currentSlippage}%`);
    });
});
document.getElementById('customSlippage').addEventListener('input', (e) => { if(e.target.value) { currentSlippage = parseFloat(e.target.value); } });

document.getElementById('swapInAmount').addEventListener('input', async (e) => {
    const val = e.target.value;
    if (!val || val <= 0 || !routerContract) { document.getElementById('swapOutAmount').value = ''; return; }
    try {
        const amountIn = tronWeb.BigNumber(val).times(10 ** 6).toString();
        const path = [WTRX_ADDRESS, CONTRACT_ADDRESS];
        const amounts = await routerContract.getAmountsOut(amountIn, path).call();
        document.getElementById('swapOutAmount').value = parseFloat(tronWeb.BigNumber(amounts[1]).div(10 ** 18).toString()).toFixed(4);
    } catch (error) { console.log("价格预估失败:", error); }
});

document.getElementById('swapBtn').addEventListener('click', async () => {
    const val = document.getElementById('swapInAmount').value;
    if (!val || val <= 0) { showToast('请输入兑换数量', true); return; }
    if (!routerContract) { showToast('请先连接钱包', true); return; }
    const btn = document.getElementById('swapBtn'); 
    btn.innerText = '兑换中...'; btn.disabled = true;
    try {
        const amountIn = tronWeb.BigNumber(val).times(10 ** 6).toString();
        const path = [WTRX_ADDRESS, CONTRACT_ADDRESS];
        const amounts = await routerContract.getAmountsOut(amountIn, path).call();
        const amountOutMin = tronWeb.BigNumber(amounts[1]).times(100 - currentSlippage).div(100).toString();
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        await routerContract.swapExactETHForTokens(amountOutMin, path, userAddress, deadline).send({ feeLimit: 150000000, callValue: amountIn });
        showToast('兑换成功！');
        await checkWallet(); document.getElementById('swapInAmount').value = ''; document.getElementById('swapOutAmount').value = '';
    } catch (error) { 
        showToast('兑换失败！请确保池子有流动性且滑点合适。', true); 
    } finally { 
        btn.innerText = '兑换'; checkPairStatus(); 
    }
});

document.getElementById('openTransferBtn').addEventListener('click', () => toggleModal(true));
document.getElementById('closeModalBtn').addEventListener('click', () => toggleModal(false));

document.getElementById('toAddress').addEventListener('blur', function() {
    const addr = this.value.trim();
    const errorMsg = document.getElementById('addressErrorMsg');
    const confirmBtn = document.getElementById('confirmTransferBtn');
    if (!addr) {
        errorMsg.classList.add('hidden'); confirmBtn.disabled = false; confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed'); return;
    }
    const check = validateTronAddress(addr);
    if (!check.ok) {
        errorMsg.innerText = "❌ " + check.reason; errorMsg.classList.remove('hidden');
        confirmBtn.disabled = true; confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        errorMsg.classList.add('hidden'); confirmBtn.disabled = false; confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
});

document.getElementById('confirmTransferBtn').addEventListener('click', async () => {
    const toAddress = document.getElementById('toAddress').value.trim();
    const amount = document.getElementById('amount').value.trim();
    if (!toAddress || !amount) { showToast('请输入接收地址和数量', true); return; }
    const check = validateTronAddress(toAddress);
    if (!check.ok) { showToast(check.reason, true); return; }
    const btn = document.getElementById('confirmTransferBtn'); 
    btn.innerText = '转账中...'; btn.disabled = true;
    try {
        let isContract = false;
        try {
            isContract = await tronWeb.isContract(toAddress);
        } catch (e) { console.log("跳过合约地址检查"); }
        if (isContract) {
            if (!confirm("⚠️ 您正在向一个智能合约地址转账！\n\n确认要继续吗？")) {
                btn.innerText = '确认转账'; btn.disabled = false; return;
            }
        }
        const transferAmount = tronWeb.BigNumber(amount).times('1000000000000000000').toString(); 
        await contract.transfer(toAddress, transferAmount).send({ feeLimit: 50000000, callValue: 0 });
        showToast('转账成功！'); await checkWallet(); toggleModal(false);
    } catch (error) { 
        showToast('转账失败！请确保有足够的 TRX 支付手续费。', true); 
    } finally { 
        btn.innerText = '确认转账'; btn.disabled = false; 
    }
});