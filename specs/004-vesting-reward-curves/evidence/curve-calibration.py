from fractions import Fraction
from random import Random
import json
import argparse
import hashlib
import os
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--solidity', action='store_true', help='Replay all report curve values in the local EVM and retain actual outputs.')
args = parser.parse_args()
capture = True
cases = {}
lifecycle_cases = []
CAP = (1 << 112) - 1
PRESETS = {'none':10000,'some':15000,'more':30000,'custom_max':100000}
def f(x, h, boost):
    u = min(x,h)
    value = x if boost == 10000 else x + (u*(2*h-u)*(boost-10000)) // (20000*h)
    if capture:
        cases[(x, 0 if boost == 10000 else h, boost)] = value
    return value
def exact(x,h,boost):
    if boost == 10000: return Fraction(x)
    u = min(x,h)
    return Fraction(x) + Fraction(boost-10000,10000)*(u-Fraction(u*u,2*h))
def percent(n,d): return round(100*n/d,6)
rows=[]
unit=10**18
h=1000*unit
for name,boost in PRESETS.items():
    rows.append({'preset':name,'first_12_average_weight':f(12*unit,h,boost)/(12*unit),'first_12_share_of_1000':percent(f(12*unit,h,boost),f(h,h,boost)),'first_100_share_of_1000':percent(f(100*unit,h,boost),f(h,h,boost)),'first_1000_share_of_2000':percent(f(h,h,boost),f(2*h,h,boost)),'average_first_window_weight':f(h,h,boost)/h,'after_window_average_weight':(f(2*h,h,boost)-f(h,h,boost))/h})
capture = False
rng=Random(409)
for trial in range(10000):
    h=rng.randint(1,CAP)
    boost=rng.randrange(10000,100001,100)
    start=rng.randint(0,CAP-1000)
    parts=[rng.randrange(0,20) for _ in range(50)]
    x=start; total=0
    for g in parts:
        delta=f(x+g,h,boost)-f(x,h,boost)
        assert delta>=g
        assert abs(delta-(exact(x+g,h,boost)-exact(x,h,boost)))<1
        total+=delta; x+=g
    assert total==f(x,h,boost)-f(start,h,boost)
capture = True
for h in [1,2,10**6,10**18,CAP]:
  for x in [0,1,h//2,h,CAP]:
    for boost in PRESETS.values():
      u=min(x,h); p=u*(2*h-u)
      assert p<2**224 and p*(boost-10000)<2**241
      assert f(x,h,boost)<2**115
      assert f(x,h,boost)==exact(x,h,boost).__floor__()
small=[]
for decimals in [0,6,18]:
 unit=10**decimals;h=10000*unit
 for name,boost in PRESETS.items():
  if name=='custom_max':continue
  amounts=[0,1,unit,100*unit]
  small.append({'decimals':decimals,'preset':name,'gross_raw':amounts,'shares_raw':[f(g,h,boost) for g in amounts]})
gradual=[]
for name,boost in PRESETS.items():
    unit=10**18; h=1000*unit
    first=f(unit,h,boost)
    first_claim=Fraction(); cohort_claim=Fraction()
    for count in range(1,1001):
        total=f(count*unit,h,boost)
        first_claim+=Fraction(first,total)
        cohort_claim+=Fraction(f(min(count,100)*unit,h,boost),total)
    gradual.append({'preset':name,'first_member_rewards_percent':float(first_claim/10),'first100_rewards_percent':float(cohort_claim/10)})

def lifecycle(boost, refund):
    """Exact-rational cash oracle for two fully specified PWYW histories.

    This illustrative model does not implement fixed-point contract accounting.
    Each contribution queues actual service time. All four allocation cuts are
    made in raw units at purchase; their earning over time uses Fractions.
    """
    unit=10**18; h=1000*unit
    cursor=0; last=0; shares={'A':0,'B':0}; eligible={'A':False,'B':False}
    credits={'A':Fraction(),'B':Fraction()}; streams=[]; refunded=Fraction()
    earned={key:Fraction() for key in ['creator','reward','referral','buyback']}
    def settle(t):
        nonlocal last
        funding=Fraction()
        for stream in streams:
            elapsed=max(0,min(t,stream['end'],stream['cancel'])-max(last,stream['start']))
            for key,amount in stream['cuts'].items():
                value=Fraction(amount*elapsed,stream['end']-stream['start'])
                earned[key]+=value
                if key=='reward':funding+=value
        total=sum(shares[m] for m in shares if eligible[m])
        assert total or not funding
        for m in shares:
            if eligible[m]: credits[m]+=funding*Fraction(shares[m],total)
        last=t
    def purchase(t,m,gross_tokens,duration):
        nonlocal cursor
        settle(t); gross=gross_tokens*unit
        shares[m]+=f(cursor+gross,h,boost)-f(cursor,h,boost)
        cursor+=gross;eligible[m]=True
        start=max([t]+[s['end'] for s in streams if s['member']==m and s['cancel']>=s['end']])
        cuts={'reward':gross//10,'referral':gross//20,'buyback':gross//20}
        cuts['creator']=gross-sum(cuts.values())
        streams.append({'member':m,'start':start,'end':start+duration,'cancel':10**9,'cuts':cuts,'gross':gross})
    duration=30 if refund else 10
    purchase(0,'A',100,duration);purchase(0,'B',100,duration)
    settle(10)
    if refund:
        for s in streams:
            if s['member']=='B':
                refunded+=Fraction(s['gross']*(s['end']-10),s['end']-s['start'])
                s['cancel']=10
    eligible['B']=False
    if not refund:purchase(10,'A',100,10)
    settle(20)
    if not refund:purchase(20,'A',100,10)
    purchase(20,'B',1,duration)
    settle(30)
    reserved=sum(Fraction(s['gross']*max(0,s['end']-30),s['end']-s['start']) for s in streams if s['cancel']>=s['end'])
    assert sum(credits.values())==earned['reward']
    assert sum(earned.values())+refunded+reserved==cursor
    lifecycle_cases.append([boost, int(refund), cursor, refunded.__floor__(), shares['A'], shares['B'], credits['A'].__floor__(), credits['B'].__floor__(), *[earned[k].__floor__() for k in ['creator', 'reward', 'referral', 'buyback']], reserved.__floor__()])
    return {'history':'refund_then_reactivate' if refund else 'sync_then_reactivate','gross_paid':cursor/unit,'refund':float(refunded/unit),'reserved':float(reserved/unit),'earned':{k:float(v/unit) for k,v in earned.items()},'member_claims':{k:float(v/unit) for k,v in credits.items()},'final_shares':{k:v/unit for k,v in shares.items()},'curve_cursor':cursor/unit}

lifecycle_rows=[]
for name,boost in PRESETS.items():
    if name=='custom_max':continue
    for refund in [False,True]:
        lifecycle_rows.append({'preset':name,**lifecycle(boost,refund)})
solidity = None
if args.solidity:
    root = Path(__file__).resolve().parents[3]
    contracts = root / 'contracts'
    target = contracts / 'deployments' / 'curve-calibration'
    target.mkdir(parents=True, exist_ok=True)
    vectors = [(*key, expected) for key, expected in cases.items()]
    words = [word for vector in vectors for word in vector]
    encoded = b''.join(word.to_bytes(32, 'big') for word in [32, len(words), *words])
    (contracts / 'test/fixtures/reward-curve-cases.bin').write_bytes(encoded)
    lifecycle_words = [word for vector in lifecycle_cases for word in vector]
    (target / 'lifecycle.bin').write_bytes(b''.join(word.to_bytes(32, 'big') for word in [32, len(lifecycle_words), *lifecycle_words]))
    (target / 'cases.json').write_text(json.dumps(vectors, indent=2) + '\n')
    linking = json.loads((contracts / 'out/vesting-leaf/link-manifest.json').read_text())['mapping']
    command = ['forge', 'test', '--libraries', linking, '--match-contract', 'RewardCurveCalibrationTest', '--code-size-limit', '1000000', '--gas-limit', '1000000000', '-vv']
    result = subprocess.run(command, cwd=contracts, env={**os.environ, 'FOUNDRY_PROFILE': 'robinhood', 'FOUNDRY_TEST': 'test'}, capture_output=True, text=True)
    output = result.stdout + result.stderr
    (target / 'solidity.log').write_text(output)
    if result.returncode:
        raise RuntimeError(f'Solidity calibration failed; inspect {target / "solidity.log"}')
    actual = [(int(index), int(value)) for index, value in re.findall(r'calibration (\d+) (\d+)', output)]
    assert actual == [(index, vector[3]) for index, vector in enumerate(vectors)], 'Missing or mismatched actual Solidity outputs'
    lifecycle_actual = [(int(index), int(a), int(b)) for index, a, b in re.findall(r'cash (\d+) (\d+) (\d+)', output)]
    assert len(lifecycle_actual) == len(lifecycle_cases), 'Missing Solidity lifecycle outputs'
    solidity = {'cases': len(vectors), 'exact_match': True, 'cases_sha256': hashlib.sha256(encoded).hexdigest(), 'actual_outputs': actual, 'lifecycle_cash_outputs': lifecycle_actual, 'lifecycle_raw_rounding_tolerance': 1}
    (target / 'result.json').write_text(json.dumps(solidity, indent=2) + '\n')
print(json.dumps({'cap':CAP,'fixed_window_calibration':rows,'pwyw_raw_granularity':small,'gradual_cash_calibration':gradual,'lifecycle_cash_calibration':lifecycle_rows,'solidity': solidity,'checks':{'seed':409,'random_histories':10000,'purchases_each':50,'partition_exact':True,'interval_rounding_error_less_than_one_share_raw':True,'zero_no_progress':True,'native_product_bits_bound':241,'cumulative_shares_bits_bound':115}},indent=2))
