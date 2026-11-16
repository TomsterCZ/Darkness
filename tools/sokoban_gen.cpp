// Sokoban reverse-BFS generator + forward verifier on an arbitrary cell graph with blocked edges.
#include <bits/stdc++.h>
using namespace std;
int N; vector<array<int,2>> pos; vector<array<int,4>> nb; map<pair<int,int>,int> id;
const int OPP[4]={1,0,3,2};
int K;
typedef uint64_t u64;
static inline u64 enc(const vector<int>&b,int reg){u64 k=reg;for(int x:b)k=(k<<7)|x;return k;}
static inline void dec(u64 k,vector<int>&b,int&reg){for(int i=K-1;i>=0;i--){b[i]=k&127;k>>=7;}reg=k;}
// flood from p avoiding boxes; returns min id, fills mark
int flood(int p,const vector<char>&isbox,vector<char>&mark){
  static vector<int> st; st.clear(); fill(mark.begin(),mark.end(),0); mark[p]=1; st.push_back(p); int mn=p;
  while(!st.empty()){int u=st.back();st.pop_back(); if(u<mn)mn=u; for(int d=0;d<4;d++){int v=nb[u][d]; if(v>=0&&!isbox[v]&&!mark[v]){mark[v]=1;st.push_back(v);}}}
  return mn;
}
int main(int argc,char**argv){
  ifstream f(argv[1]); f>>N; pos.resize(N); nb.resize(N);
  for(int i=0;i<N;i++){f>>pos[i][0]>>pos[i][1]; for(int d=0;d<4;d++)f>>nb[i][d]; id[{pos[i][0],pos[i][1]}]=i;}
  string mode=argv[2];
  int startCell=id[{atoi(argv[3]),atoi(argv[4])}];
  vector<int> goals; int a=5;
  K=atoi(argv[a++]);
  for(int i=0;i<K;i++){int c=atoi(argv[a++]),r=atoi(argv[a++]); goals.push_back(id.at({c,r}));}
  sort(goals.begin(),goals.end());
  vector<char> isbox(N,0),mark(N,0);
  if(mode=="gen"){
    set<int> forbid; while(a+1<argc){int c=atoi(argv[a++]),r=atoi(argv[a++]); forbid.insert(id.at({c,r}));}
    unordered_map<u64,uint16_t> dist; dist.reserve(1<<24);
    vector<u64> cur,nxt;
    for(int g:goals)isbox[g]=1;
    {set<int> regs; for(int i=0;i<N;i++)if(!isbox[i]){int m=flood(i,isbox,mark);
        // only regions from which a last push is plausible: region contains a cell adjacent to a box
        bool ok=false; for(int g:goals)for(int d=0;d<4;d++){int v=nb[g][d]; if(v>=0&&mark[v])ok=true;}
        if(ok)regs.insert(m);}
     for(int m:regs){u64 k=enc(goals,m); dist[k]=0; cur.push_back(k);} }
    for(int g:goals)isbox[g]=0;
    int level=0; vector<int> b(K); int reg; u64 best=0; int bestd=-1; vector<u64> lastLevels;
    vector<vector<u64>> keep; // states per level that satisfy start condition
    while(!cur.empty()){
      vector<u64> ok;
      for(u64 k:cur){
        dec(k,b,reg); for(int x:b)isbox[x]=1; flood(reg,isbox,mark);
        if(mark[startCell]){bool bad=false; for(int x:b)if(forbid.count(x))bad=true; if(!bad)ok.push_back(k);}
        // pulls
        for(int i=0;i<K;i++){int B=b[i];
          for(int e=0;e<4;e++){ // box moves in direction OPP... player at B-e i.e. neighbour in dir OPP[e]
            int p=nb[B][OPP[e]]; if(p<0||isbox[p]||!mark[p])continue; int q=nb[p][OPP[e]]; if(q<0||isbox[q])continue;
            // new state: box at p, player at q
            vector<int> nbx=b; nbx[i]=p; sort(nbx.begin(),nbx.end());
            isbox[B]=0; isbox[p]=1; static vector<char> m2; m2.assign(N,0); int m=flood(q,isbox,m2); isbox[p]=0; isbox[B]=1;
            u64 nk=enc(nbx,m); if(dist.find(nk)==dist.end()){dist[nk]=level+1; nxt.push_back(nk);}
          }}
        for(int x:b)isbox[x]=0;
      }
      keep.push_back(ok);
      cur.swap(nxt); nxt.clear(); level++;
    }
    fprintf(stderr,"states %zu maxdepth %d\n",dist.size(),level-1);
    // single-box lower bounds: d1[g][s] = min pushes for a lone box from s to goal g
    int KK=K; K=1; vector<vector<int>> d1(KK,vector<int>(N,9999));
    for(int gi=0;gi<KK;gi++){int g=goals[gi]; unordered_map<u64,int> dd; deque<u64> qq; vector<int> bb(1); int rg;
      fill(isbox.begin(),isbox.end(),0); isbox[g]=1; set<int> regs; for(int i=0;i<N;i++)if(!isbox[i])regs.insert(flood(i,isbox,mark)); isbox[g]=0;
      for(int m:regs){vector<int> v{g}; u64 k=enc(v,m); dd[k]=0; qq.push_back(k);} d1[gi][g]=0;
      while(!qq.empty()){u64 k=qq.front();qq.pop_front(); dec(k,bb,rg); int B=bb[0]; isbox[B]=1; flood(rg,isbox,mark);
        for(int e=0;e<4;e++){int p=nb[B][OPP[e]]; if(p<0||!mark[p])continue; int q=nb[p][OPP[e]]; if(q<0)continue;
          isbox[B]=0; isbox[p]=1; static vector<char> m2; m2.assign(N,0); int m=flood(q,isbox,m2); isbox[p]=0; isbox[B]=1;
          vector<int> v{p}; u64 nk=enc(v,m); if(!dd.count(nk)){dd[nk]=dd[k]+1; d1[gi][p]=min(d1[gi][p],dd[nk]); qq.push_back(nk);} }
        isbox[B]=0; }
    }
    K=KK;
    struct Cand{int ex,depth; u64 k;}; vector<Cand> cands; vector<int> perm(K);
    for(int L=0;L<(int)keep.size();L++) for(u64 k:keep[L]){ dec(k,b,reg); iota(perm.begin(),perm.end(),0); int best=1e9;
        do{int s2=0; for(int i=0;i<K;i++)s2+=d1[perm[i]][b[i]]; best=min(best,s2);}while(next_permutation(perm.begin(),perm.end()));
        cands.push_back({L-best,L,k}); }
    sort(cands.begin(),cands.end(),[](const Cand&x,const Cand&y){return x.ex!=y.ex? x.ex>y.ex : x.depth>y.depth;});
    int minDepth = getenv("MIND")?atoi(getenv("MIND")):0; int shown=0;
    for(auto&c:cands){ if(c.depth<minDepth)continue; dec(c.k,b,reg); printf("excess %d depth %d :",c.ex,c.depth); for(int x:b)printf(" %d %d",pos[x][0],pos[x][1]); printf("\n"); if(++shown>=25)break; }
    return 0;
  }
  if(mode=="solve"){
    vector<int> boxes; for(int i=0;i<K;i++){int c=atoi(argv[a++]),r=atoi(argv[a++]); boxes.push_back(id.at({c,r}));}
    sort(boxes.begin(),boxes.end());
    struct Par{u64 prev; int box,dir,pl;};
    unordered_map<u64,Par> par; deque<pair<u64,int>> q; // key, exact player pos unknown -> store player in map
    unordered_map<u64,int> ppos;
    for(int x:boxes)isbox[x]=1; int m=flood(startCell,isbox,mark); for(int x:boxes)isbox[x]=0;
    u64 sk=enc(boxes,m); par[sk]={~0ull,-1,-1,startCell}; ppos[sk]=startCell; q.push_back({sk,0});
    vector<int> b(K); int reg; u64 goalk=0; bool found=false; int gd=0;
    while(!q.empty()){auto [k,d]=q.front(); q.pop_front(); dec(k,b,reg);
      if(b==goals){goalk=k;found=true;gd=d;break;}
      for(int x:b)isbox[x]=1; flood(reg,isbox,mark);
      for(int i=0;i<K;i++){int B=b[i]; for(int e=0;e<4;e++){int p=nb[B][OPP[e]]; if(p<0||isbox[p]||!mark[p])continue; if(nb[p][e]!=B)continue; int t=nb[B][e]; if(t<0||isbox[t])continue;
        vector<int> nbx=b; nbx[i]=t; sort(nbx.begin(),nbx.end()); isbox[B]=0; isbox[t]=1; static vector<char> m2; m2.assign(N,0); int mm=flood(B,isbox,m2); isbox[t]=0; isbox[B]=1;
        u64 nk=enc(nbx,mm); if(!par.count(nk)){par[nk]={k,B,e,B}; q.push_back({nk,d+1});}
      }}
      for(int x:b)isbox[x]=0;
    }
    if(!found){printf("UNSOLVABLE\n");return 0;}
    // reconstruct pushes
    vector<array<int,2>> pushes; u64 k=goalk; while(par[k].box>=0){pushes.push_back({par[k].box,par[k].dir}); k=par[k].prev;}
    reverse(pushes.begin(),pushes.end());
    // expand into moves with BFS walking
    string dirs="LRDU"; // 0:c+ (down-left) 1:c- 2:r+ 3:r-
    int pl=startCell; vector<int> bx=boxes; string out; int nm=0;
    for(auto&pp:pushes){int B=pp[0],e=pp[1]; int stand=nb[B][OPP[e]];
      fill(isbox.begin(),isbox.end(),0); for(int x:bx)isbox[x]=1;
      vector<int> pr(N,-2),pd(N,-1); deque<int> qq; qq.push_back(pl); pr[pl]=-1;
      while(!qq.empty()){int u=qq.front();qq.pop_front(); for(int d2=0;d2<4;d2++){int v=nb[u][d2]; if(v>=0&&!isbox[v]&&pr[v]==-2){pr[v]=u;pd[v]=d2;qq.push_back(v);}}}
      string w; int u=stand; while(pr[u]!=-1){w.push_back('0'+pd[u]);u=pr[u];} reverse(w.begin(),w.end()); out+=w; out.push_back('0'+e); nm+=w.size()+1;
      for(int&x:bx)if(x==B)x=nb[B][e]; pl=B;
    }
    printf("pushes %d moves %d\n%s\n",gd,nm,out.c_str());
    return 0;
  }
}
