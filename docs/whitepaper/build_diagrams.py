from pathlib import Path
from html import escape

OUT = Path(__file__).parent / 'assets'
OUT.mkdir(exist_ok=True)
INK, PAPER, LINE, MUTED = '#11131a', '#f7f2e8', '#c9c3b8', '#4d4f5d'
CORAL, BLUE, LIME = '#ff6a4d', '#574fe6', '#d9f99d'

class Drawing:
    def __init__(self, title, desc, height=920):
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="{height}" viewBox="0 0 1400 {height}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>', '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10" fill="none" stroke="#11131a" stroke-width="1.4"/></marker></defs>', f'<rect width="1400" height="{height}" fill="{PAPER}"/>']
    def text(self,x,y,s,size=24,color=INK,weight=400,anchor='start'):
        self.parts.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="Arial, Helvetica, sans-serif" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(s)}</text>')
    def rect(self,x,y,w,h,fill='none',stroke=LINE,r=12):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
    def path(self,d,color=LINE,width=2,dash=None,arrow=False):
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"'+(f' stroke-dasharray="{dash}"' if dash else '')+(' marker-end="url(#arrow)"' if arrow else '')+'/>')
    def title(self,n,title,sub):
        self.text(60,48,f'BACKED BY FANS  /  {n}',16,MUTED,700)
        self.text(60,105,title,42,INK,500)
        self.text(60,147,sub,23,MUTED)
    def save(self,name):
        (OUT/name).write_text('\n'.join(self.parts)+ '\n</svg>\n')

f=Drawing('How a membership payment is earned','A creator sets tier terms. A fan funds membership time. Creator, member, referral and protocol allocations all accrue over paid time. Earned protocol fees are released before buyback and burn execution.',960)
f.title('02','A payment starts. Support keeps flowing.','Illustrative tier: 100 units for 30 days · 70% creator / 20% members / 5% referral / 5% protocol')
for x,label,sub in [(350,'Creator','Sets the tier’s terms'),(1050,'Fan','Pays to join or renew')]:
    f.text(x,222,label,29,INK,700,'middle');f.text(x,259,sub,22,MUTED,400,'middle')
f.path('M350 280 V296 Q350 308 362 308 H688 Q700 308 700 320 V334',INK,2,arrow=True)
f.path('M1050 280 V296 Q1050 308 1038 308 H712 Q700 308 700 320',INK,2)
f.rect(445,348,510,126,'#fffdf8')
f.text(700,392,'Membership tier',28,INK,700,'middle')
f.text(700,433,'Payment allocated; earnings accrue over time',21,MUTED,400,'middle')
f.path('M700 474 V516 M220 568 V530 Q220 516 234 516 H1166 Q1180 516 1180 530 V568 M540 516 V568 M860 516 V568',INK,2)
f.text(700,548,'Earned over paid time',18,MUTED,400,'middle')
for x,label,pct,total,sub in [(80,'Creator','70%','35 units','Creator earnings'),(400,'Members','20%','10 units','Shared reward pool'),(720,'Referrer','5%','2.5 units','Recorded referrer'),(1040,'Protocol','5%','2.5 units','Earned protocol fees')]:
    f.rect(x,568,280,156,'#fffdf8');f.text(x+22,608,label,26,INK,700);f.text(x+258,608,pct,21,MUTED,400,'end');f.text(x+22,655,total,31);f.text(x+22,694,sub,20,MUTED)
f.text(80,784,'HALFWAY THROUGH THE PERIOD',17,MUTED,700)
f.text(80,821,'Day 15: 50 units earned · 50 units still unearned',24)
f.path('M1180 724 V766',INK,2,arrow=True)
f.text(1180,797,'Release fees',22,INK,500,'middle')
f.path('M1180 813 V843',INK,2,arrow=True)
f.text(1180,878,'Buyback → Burn',25,INK,700,'middle')
f.text(80,906,'Example assumes a recorded referrer. Member amounts are pool totals, not individual rewards.',19,MUTED)
f.text(1180,914,'Separate execution',18,MUTED,400,'middle')
f.save('payment-flow.svg')

t=Drawing('Membership access, NFT ownership and rewards over time','A positive payment creates membership. Renewal extends access. At expiry access ends but the NFT and reward eligibility remain. Creator synchronization burns the NFT and suspends rewards. A positive payment on return remints the same identity and restores eligibility.',830)
t.title('01','One membership. Three different states.','Example: a paid membership with rewards enabled, no refund, and no complimentary time.')
xs=[290,500,760,990,1210]
labels=[('Join','Positive payment'),('Renew','Time added'),('Expire','Time runs out'),('Creator sync','Expired NFT burned'),('Return','Positive payment')]
for x,(label,sub) in zip(xs,labels):
    t.text(x,228,label,24,INK,700,'middle');t.text(x,261,sub,17,MUTED,400,'middle');t.path(f'M{x} 286 V620',LINE,1.5,'4 8')
for y,label in [(334,'Active access'),(444,'NFT in wallet'),(554,'Reward eligibility')]:
    t.text(60,y+10,label,21,INK,700)
    t.rect(290,y-25,1030,54,'#e9e4da','none',6)
    end=760 if y==334 else 990
    t.rect(290,y-25,end-290,54,LIME if y==334 else INK,'none',6)
    t.text((290+end)/2,y+10,'Active' if y==334 else ('Present' if y==444 else 'Eligible'),22,INK if y==334 else PAPER,500,'middle')
    t.rect(1210,y-25,110,54,LIME if y==334 else INK,'none',6)
    t.text(1265,y+10,'Active' if y==334 else ('Present' if y==444 else 'Eligible'),18,INK if y==334 else PAPER,500,'middle')
    t.text((end+1210)/2,y+10,'Expired' if y==334 else ('Burned' if y==444 else 'Suspended'),20,MUTED,400,'middle')
t.path('M290 641 H1320',INK,2,arrow=True)
t.text(1320,676,'Time →',19,MUTED,400,'end')
t.text(60,725,'Expiry ends access. Creator synchronization separately burns the NFT and suspends reward eligibility.',22)
t.text(60,766,'The same identity can return. Previously earned rewards remain claimable after the NFT is burned.',21,MUTED)
t.text(60,803,'Event spacing is illustrative. Returning remains subject to the tier’s capacity and terms.',18,MUTED)
t.save('membership-timeline.svg')

c=Drawing('Early-support reward weight','Illustrative 1.5 times starting boost tapers to 1 times after 1000 total payment units. The curve shows weight per additional payment unit, not a loss of previously earned weight. The first 100 units add 147.5 shares; 100 units paid after the threshold add 100 shares.',940)
c.title('03','Earlier support can receive more weight.','Illustrative curve: 1.5× starting weight, reaching 1× after 1,000 units paid into the tier.')
x0,x1,y0,y1=160,1260,585,260
X=lambda v:x0+(x1-x0)*v/1500
Y=lambda v:y0-(y0-y1)*(v-1)/.5
c.text(160,207,'Weight per additional payment unit',22,INK,700)
for val in [1,1.25,1.5]:
    y=Y(val);c.path(f'M{x0} {y} H{x1}',LINE,1.5);c.text(131,y+7,f'{val:g}×',20,MUTED,400,'end')
for val in [0,500,1000,1500]:c.text(X(val),622,f'{val:,}',20,MUTED,400,'middle')
c.path(f'M{x0} {y1-10} V{y0} H{x1+12}',INK,2)
c.path(f'M{X(1000)} {y1-10} V{y0}',MUTED,1.5,'5 7')
c.path(f'M{x0} {Y(1.5)} L{X(1000)} {Y(1)} H{x1}',BLUE,5)
c.text(410,343,'Bonus on new payments tapers',23,BLUE,700)
c.text(1110,550,'Normal weight',21,INK,500,'middle')
c.text(710,672,'Total paid into the tier (units)',22,INK,500,'middle')
c.rect(60,714,610,129,'#fffdf8');c.text(86,750,'First 100 units paid',22,INK,700);c.text(86,791,'147.5 shares added',28);c.text(86,822,'Includes the average bonus across that payment.',18,MUTED)
c.rect(700,714,640,129,'#fffdf8');c.text(726,750,'100 units paid after the threshold',22,INK,700);c.text(726,791,'100 shares added',28);c.text(726,822,'Earlier shares keep their existing weight.',18,MUTED)
c.text(60,893,'The curve changes the weight added by new payments. Weight already earned does not shrink.',23,INK,700)
c.text(60,926,'Shares determine the split of eligible member rewards; they are not a promised reward amount.',19,MUTED)
c.save('reward-weight.svg')
print('Created',len(list(OUT.glob('*.svg'))),'SVG diagrams')
