import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';

dayjs.extend(isoWeek);

const TYPE_POST_PAGE = 'fbPage';

/**
 * Tạo shard number từ created_time: format GGGGWW (ISO year + ISO week)
 */
function getShardNumber(createdTime) {
    const d = dayjs(createdTime);
    const y = d.isoWeekYear();
    const w = String(d.isoWeek()).padStart(2, '0');
    return `${y}${w}`;
}

/**
 * Build buzz object từ postInfo (Graph API post) và authorInfo (page/user)
 * @param {Object} postInfo - Post từ Graph API (có reactions, comments, shares, attachments, from...)
 * @param {Object} authorInfo - { id, name }
 * @param {string} typePost - 'fbPage' | 'fbUserTopic'
 */
export function buildBuzzFromPost(postInfo, authorInfo, typePost = TYPE_POST_PAGE) {
    const shardNumber = getShardNumber(postInfo.created_time);
    const likes = postInfo?.reactions?.summary?.total_count ?? 0;
    const comments =
        postInfo?.comments?.summary?.total_count ??
        postInfo?.comment_count ??
        0;
    const shares = postInfo?.shares?.count ?? 0;

    let dinhKem = postInfo?.attachments?.data ?? [];
    let description = '';
    let link = '';
    if (dinhKem.length) {
        description = dinhKem[0]?.title ?? '';
        description = dinhKem[0]?.description
            ? `${description} - ${dinhKem[0].description}`
            : description;
        link = dinhKem[0]?.unshimmed_url ?? '';
    }
    description = postInfo?.story ? `${description} - ${postInfo.story}`.trim() : description;

    const interactions = likes + shares + comments;
    let author = postInfo?.from?.name ?? 'Anonymous';
    let authorId = postInfo?.from?.id ?? authorInfo?.id;
    if (typePost === 'fbUserTopic' && authorInfo) {
        author = authorInfo.name;
        authorId = authorInfo.id;
    }
    const picture = postInfo?.full_picture ?? 'null';
    const idForUrl = postInfo.id.replace('_', '/posts/');
    const url = `https://www.facebook.com/${idForUrl}`;

    return {
        idFb: postInfo.id,
        index: 'master' + shardNumber,
        type: typePost,
        id: postInfo.id,
        siteName: authorInfo?.name ?? '',
        siteId: authorInfo?.id ?? '',
        insertedDate: dayjs().add(7, 'hour').toISOString(),
        publishedDate: dayjs(postInfo.created_time).toISOString(),
        url,
        author,
        authorId,
        title: '',
        description,
        link,
        content: (postInfo?.message ?? '').replace(/(\r\n|\n|\r|\t)/gm, ''),
        delayCrawler: '0',
        picture,
        likes,
        shares,
        comments,
        interactions,
        delayMongo: '0',
        delayEs: '0',
        ds: {
            ip: '177.31.05.22',
            source: 'crawler-v8-2025'
        },
        nextPage: 'null'
    };
}

const TYPE_COMMENT_PAGE = 'fbPageComment';

/**
 * Build buzz object cho comment (con của post)
 * @param {Object} e - Comment từ Graph API (id, message, created_time, from, comment_count?)
 * @param {Object} parentBuzz - Buzz của post cha (có url, siteName, siteId, content, description, publishedDate, id)
 * @param {string} typeCmt - type của comment, mặc định 'fbPageComment'
 */
export function buildCommentBuzz(e, parentBuzz, typeCmt = TYPE_COMMENT_PAGE) {
    const index = getShardNumber(e.created_time);
    const author = e?.from?.name ? e.from.name : 'Anonymous';
    const authorId = e?.from?.id ? e.from.id : 'Anonymous';
    const content = e?.message ? e.message : '';
    const commentCount = e?.comment_count ? e.comment_count : 0;

    let commentId = `${e.id}`;
    let url;
    if (commentId.indexOf('_') === -1) {
        const postIds = parentBuzz.id.replace(/(\d{1,})(_)/g, '');
        commentId = `${postIds}_${e.id}`;
        url = `${parentBuzz.url}?comment_id=${e.id}`;
    } else {
        const cmtIds = commentId.replace(/(\d{1,})(_)/g, '');
        url = `${parentBuzz.url}?comment_id=${cmtIds}`;
    }

    return {
        index: 'master' + index,
        type: typeCmt,
        id: commentId,
        siteName: parentBuzz.siteName,
        siteId: parentBuzz.siteId,
        insertedDate: dayjs().add(7, 'hour').toISOString(),
        publishedDate: dayjs(e.created_time).toISOString(),
        url,
        author,
        authorId,
        title: parentBuzz.content,
        description: parentBuzz.description,
        content: (content ?? '').replace(/(\r\n|\n|\r|\t)/gm, ''),
        parentId: parentBuzz.id,
        parentDate: parentBuzz.publishedDate,
        commentCount,
        delayCrawler: '0',
        likes: '0',
        shares: '0',
        comments: '0',
        interactions: '0',
        delayMongo: '0',
        delayEs: '0',
        ds: {
            ip: '177.31.05.22',
            source: 'crawler-v8-2025'
        }
    };
}

/**
 * Tạo payload bulk index cho Elasticsearch (index + doc) - post buzz
 */
export function buildEsBulkInsert(buzz) {
    return [
        {
            index: {
                _index: buzz.index,
                _type: buzz.type,
                _id: buzz.id
            }
        },
        {
            siteName: buzz.siteName,
            siteId: buzz.siteId,
            insertedDate: buzz.insertedDate,
            publishedDate: buzz.publishedDate,
            url: buzz.url,
            author: buzz.author,
            authorId: buzz.authorId,
            title: buzz.title,
            description: buzz.description,
            content: buzz.content,
            link: buzz.link,
            picture: buzz.picture,
            delayCrawler: buzz.delayCrawler,
            likes: buzz.likes,
            shares: buzz.shares,
            comments: buzz.comments,
            interactions: buzz.interactions,
            delayMongo: buzz.delayMongo,
            delayEs: buzz.delayEs,
            ds: buzz.ds
        }
    ];
}

/**
 * Tạo payload bulk index cho Elasticsearch - comment buzz
 */
export function buildEsBulkInsertForComment(buzz) {
    return [
        {
            index: {
                _index: buzz.index,
                _type: buzz.type,
                _id: buzz.id
            }
        },
        {
            siteName: buzz.siteName,
            siteId: buzz.siteId,
            insertedDate: buzz.insertedDate,
            publishedDate: buzz.publishedDate,
            url: buzz.url,
            author: buzz.author,
            authorId: buzz.authorId,
            title: buzz.title,
            description: buzz.description,
            content: buzz.content,
            parentId: buzz.parentId,
            parentDate: buzz.parentDate,
            commentCount: buzz.commentCount,
            delayCrawler: buzz.delayCrawler,
            likes: buzz.likes,
            shares: buzz.shares,
            comments: buzz.comments,
            interactions: buzz.interactions,
            delayMongo: buzz.delayMongo,
            delayEs: buzz.delayEs,
            ds: buzz.ds
        }
    ];
}
