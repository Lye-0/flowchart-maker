//9-1
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#define RANKING_SIZE 15  //初期生成するランキングの幅
#define NUM_RANGE 128  //ランダムに生成する数の幅
float ranking[RANKING_SIZE] = {2.1, 3.2, 4.2, 5.0, 6.0, 7.1, 8.4, 9.5, 10.0, 11.2, 12.0, 13.0, 14.0, 15.0, 16.0};
void print_ranking(float ranking[]);
int get_ranking(float ranking[], float score);
void update_ranking(float ranking[], int rank, float score);
int main() {
    int one_more = 1;
    print_ranking(ranking);
    while (one_more == 1) {
        int num;
        int user_input;
        int charange = 1;
        int sum = 0;
        float score = 0;
        int rank = 0;
        for (int i = 1; i <= 3; i++) {
            printf("\n--- ターン%d ---\n", i);
            srandom(time(NULL));
            num = random() % NUM_RANGE+1;
            printf("(正解): %d\n", num);
            charange = 1;
            user_input = 0;
            while (user_input != num) {
                printf("%d回目の挑戦\n", charange);
                printf("入力: ");
                scanf("%d", &user_input);
                if (user_input == num) {
                    printf("%d回目で正解\n", charange);
                    sum += charange;
                    break;
                } else if (user_input - num <= 5 && num - user_input <= 5) {
                    printf("誤差5以内\n");
                } else if (user_input - num <= 10 && num - user_input <= 10) {
                    printf("誤差10以内\n");
                } else { printf("誤差10以上\n"); }
                printf("\n");
                charange++;
            }
        }
        score = sum/3.0;
        printf("\n--- 結果 ---\n");
        printf("スコア: %f\n", score);
        if (score <= 3) { printf("平均3回以下\n"); }
        else if (3 < score && score <= 5) { printf("平均3～5回\n"); }
        else if (5 < score && score <= 10) { printf("平均5～10回\n"); }
        else { printf("平均10回より上\n"); }
        rank = get_ranking(ranking, score);
        update_ranking(ranking, rank, score);
        print_ranking(ranking);
        printf("リトライしますか？\nYes[1] No[0]\n");
        scanf("%d", &one_more);
        printf("\n--------------------------------------\n");
    }
    return 0;
}
void update_ranking(float ranking[], int rank, float score) {
    if (rank != 0) {
        for (int i = RANKING_SIZE-1; i >= rank; i--) { ranking[i] = ranking[i-1]; }
        ranking[rank-1] = score;
    }
}
void print_ranking(float ranking[]) {
    printf("\n----- 現在のランキング -----\n");
    printf("Rank       Score");
    for (int i = 1; i <= RANKING_SIZE; i++) { printf("\n%2d ・・・ %9f", i, ranking[i-1]); }
    printf("\n\n");
}
int get_ranking(float ranking[], float score) {
    for (int i = 1; i <= RANKING_SIZE; i++) {
        if (score <= ranking[i-1]) { printf("あなたは%d位です\n", i); return i; }
    }
    printf("あなたはランキング外です\n");
    return 0;
}
